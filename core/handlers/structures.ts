import type {
    PlanStructure,
    StructureAddPayload,
    StructureImportItem,
    StructureImportPreviewRow,
    StructureImportStatus,
    StructureListImportResult,
    StructureLocation,
    StructureNode,
    StructureType,
} from "@shared/index";
import {
    matchStructureKeyword,
    parseStructureList,
    typeFromColumn,
} from '../import/structureListParser.js';
import { register } from '../registerCore.js';
import { getDb, type Db } from '../db/Db.js';
import { getHost } from '../host.js';
import { computeProfitability, hasMarketData, type ProfitabilityResult } from "../market/profitability.js";

function assertWritable(db: Db, planId: number): void {
    const row = db.prepare('SELECT read_only FROM plans WHERE id = ?').get(planId) as { read_only: number } | undefined;
    if (row?.read_only === 1) throw new Error('Plan is read-only');
}

interface StructureDbRow {
    id: number;
    plan_id: number;
    system_id: number;
    structure_type: string;
    name: string | null;
    location: string | null;
    moon_id: number | null;
    notes: string | null;
    source: string;
    system_name: string;
    constellation_id: number;
    constellation_name: string;
    region_id: number;
    region_name: string;
}

function rowToStructure(row: StructureDbRow): PlanStructure {
    return {
        id: row.id,
        planId: row.plan_id,
        systemId: row.system_id,
        structureType: row.structure_type as StructureType,
        name: row.name,
        location: row.location as StructureLocation | null,
        moonId: row.moon_id,
        notes: row.notes,
        source: row.source as PlanStructure["source"],
    };
}

function groupIntoNodes(rows: StructureDbRow[]): StructureNode[] {
    const bySystem = new Map<number, StructureNode>();
    for (const row of rows) {
        if (!bySystem.has(row.system_id)) {
            bySystem.set(row.system_id, {
                systemId: row.system_id,
                systemName: row.system_name,
                constellationId: row.constellation_id,
                constellationName: row.constellation_name,
                regionId: row.region_id,
                regionName: row.region_name,
                structures: [],
            });
        }
        bySystem.get(row.system_id)!.structures.push(rowToStructure(row));
    }
    return Array.from(bySystem.values());
}

// Regions the plan covers: every region containing a system in the plan's
// scopes (region, constellation or single system), plus regions of systems
// that have upgrades or a status set. Same set the Region Map dropdown lists.
const PLAN_REGIONS_SQL = `
  SELECT DISTINCT s.region_id FROM systems s
  JOIN plan_scopes ps ON
    (ps.scope_type = 'system'        AND ps.scope_id = s.id)               OR
    (ps.scope_type = 'constellation' AND ps.scope_id = s.constellation_id) OR
    (ps.scope_type = 'region'        AND ps.scope_id = s.region_id)
  WHERE ps.plan_id = @planId
  UNION
  SELECT s.region_id FROM plan_upgrades pu JOIN systems s ON s.id = pu.system_id
  WHERE pu.plan_id = @planId
  UNION
  SELECT s.region_id FROM plan_system_status x JOIN systems s ON s.id = x.system_id
  WHERE x.plan_id = @planId
`;

function broadcastPlanChanged(planId: number): void {
    getHost().broadcast('plan-changed', { planId });
}

const LIST_SQL = `
  SELECT ps.id, ps.plan_id, ps.system_id, ps.structure_type, ps.name, ps.location,
         ps.moon_id, ps.notes, ps.source,
         s.name AS system_name,
         c.id AS constellation_id, c.name AS constellation_name,
         r.id AS region_id, r.name AS region_name
  FROM plan_structures ps
  JOIN systems s ON s.id = ps.system_id
  JOIN constellations c ON c.id = s.constellation_id
  JOIN regions r ON r.id = c.region_id
  WHERE ps.plan_id = @planId
  ORDER BY r.name, c.name, s.name, ps.id
`;

const LIST_BY_SYSTEM_SQL = `
  SELECT ps.id, ps.plan_id, ps.system_id, ps.structure_type, ps.name, ps.location,
         ps.moon_id, ps.notes, ps.source,
         s.name AS system_name,
         c.id AS constellation_id, c.name AS constellation_name,
         r.id AS region_id, r.name AS region_name
  FROM plan_structures ps
  JOIN systems s ON s.id = ps.system_id
  JOIN constellations c ON c.id = s.constellation_id
  JOIN regions r ON r.id = c.region_id
  WHERE ps.plan_id = @planId AND ps.system_id = @systemId
  ORDER BY ps.id
`;

export function registerStructuresHandlers(): void {
    register(
        "structures.list",
        (planId: number, systemId?: number): StructureNode[] => {
            const db = getDb();
            const rows =
                systemId != null
                    ? (db
                          .prepare(LIST_BY_SYSTEM_SQL)
                          .all({ planId, systemId }) as StructureDbRow[])
                    : (db
                          .prepare(LIST_SQL)
                          .all({ planId }) as StructureDbRow[]);
            return groupIntoNodes(rows);
        },
    );

    register(
        "structures.add",
        (
            planId: number,
            systemId: number,
            structure: StructureAddPayload,
        ): { id: number } => {
            const db = getDb();
            assertWritable(db, planId);
            const result = db
                .prepare(
                    `INSERT INTO plan_structures (plan_id, system_id, structure_type, name, location, notes, source)
         VALUES (?, ?, ?, ?, ?, ?, 'manual')`,
                )
                .run(
                    planId,
                    systemId,
                    structure.structureType,
                    structure.name ?? null,
                    structure.location ?? null,
                    structure.notes ?? null,
                );
            broadcastPlanChanged(planId);
            return { id: result.lastInsertRowid as number };
        },
    );

    register(
        "structures.remove",
        (planId: number, structureId: number): void => {
            const db = getDb();
            assertWritable(db, planId);
            db.prepare(
                "DELETE FROM plan_structures WHERE id = ? AND plan_id = ?",
            ).run(structureId, planId);
            broadcastPlanChanged(planId);
        },
    );

    register(
        "structures.importClipboard",
        (
            planId: number,
            systemId: number,
            text: string,
        ): { count: number } => {
            const db = getDb();
            assertWritable(db, planId);
            const lines = text
                .split("\n")
                .map((l) => l.trim())
                .filter(Boolean);
            const ins = db.prepare(
                `INSERT INTO plan_structures (plan_id, system_id, structure_type, name, location, source)
         VALUES (?, ?, ?, ?, ?, 'clipboard')`,
            );
            let count = 0;
            db.transaction(() => {
                for (const line of lines) {
                    const { structureType, location } = matchStructureKeyword(line);
                    ins.run(planId, systemId, structureType, line, location);
                    count++;
                }
            })();
            if (count > 0) broadcastPlanChanged(planId);
            return { count };
        },
    );

    // Two-step plan-wide import of text copied from EVE's corporation
    // Structures window: preview (writes nothing) -> user review -> import of
    // the selected rows. Only the system, name and Type column are used.
    register(
        "structures.previewStructureList",
        (planId: number, text: string): StructureImportPreviewRow[] => {
            const db = getDb();
            const findSystem = db.prepare(
                `SELECT s.id, r.id AS region_id, r.name AS region_name
         FROM systems s JOIN regions r ON r.id = s.region_id
         WHERE s.name = ? COLLATE NOCASE`,
            );
            const existing = db.prepare(
                "SELECT 1 FROM plan_structures WHERE plan_id = ? AND system_id = ? AND name = ?",
            );
            const planRegions = new Set(
                (db.prepare(PLAN_REGIONS_SQL).all({ planId }) as { region_id: number }[])
                    .map((r) => r.region_id),
            );
            // Repeats within the paste: first occurrence wins.
            const seen = new Set<string>();

            return parseStructureList(text).map((row): StructureImportPreviewRow => {
                const { structureType, location } = typeFromColumn(row.typeText);
                const base = {
                    line: row.line,
                    systemName: row.systemName,
                    name: row.name,
                    typeText: row.typeText,
                    structureType,
                    location,
                };
                const system = findSystem.get(row.systemName) as
                    | { id: number; region_id: number; region_name: string }
                    | undefined;
                if (!system) {
                    return { ...base, systemId: null, regionName: null, status: "unknownSystem" };
                }
                const key = `${system.id}\u0000${row.name}`;
                const isDuplicate =
                    seen.has(key) || !!existing.get(planId, system.id, row.name);
                seen.add(key);
                const status: StructureImportStatus = isDuplicate
                    ? "duplicate"
                    // A plan with no regions yet treats everything as in-plan.
                    : planRegions.size > 0 && !planRegions.has(system.region_id)
                      ? "outsidePlan"
                      : "new";
                return {
                    ...base,
                    systemId: system.id,
                    regionName: system.region_name,
                    status,
                };
            });
        },
    );

    register(
        "structures.importStructureList",
        (planId: number, items: StructureImportItem[]): StructureListImportResult => {
            const db = getDb();
            assertWritable(db, planId);
            const systemExists = db.prepare("SELECT 1 FROM systems WHERE id = ?");
            const existing = db.prepare(
                "SELECT 1 FROM plan_structures WHERE plan_id = ? AND system_id = ? AND name = ?",
            );
            const ins = db.prepare(
                `INSERT INTO plan_structures (plan_id, system_id, structure_type, name, location, source)
         VALUES (?, ?, ?, ?, ?, 'clipboard')`,
            );

            const result: StructureListImportResult = { imported: 0, skippedDuplicates: 0 };
            db.transaction(() => {
                for (const item of items) {
                    const name = typeof item.name === "string" ? item.name.trim() : "";
                    if (!name || !systemExists.get(item.systemId)) continue;
                    // Re-checked here: the plan may have changed since the preview,
                    // and the DB already includes rows inserted earlier in this loop.
                    if (existing.get(planId, item.systemId, name)) {
                        result.skippedDuplicates++;
                        continue;
                    }
                    // Type is recomputed from the Type column, never from the name.
                    const { structureType, location } = typeFromColumn(item.typeText);
                    ins.run(planId, item.systemId, structureType, name, location);
                    result.imported++;
                }
            })();
            if (result.imported > 0) broadcastPlanChanged(planId);
            return result;
        },
    );

    register(
        "structures.profitability",
        (structureId: number): ProfitabilityResult | null => {
            const db = getDb();
            if (!hasMarketData(db)) return null;
            return computeProfitability(db, structureId);
        },
    );
}
