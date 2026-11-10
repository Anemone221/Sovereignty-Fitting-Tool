import type {
    PlanStructure,
    StructureAddPayload,
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

    // Plan-wide import of text copied from EVE's corporation Structures window.
    // Only the system, name and Type column are used; duplicates (same plan,
    // system and exact name) are skipped, including repeats within the paste.
    register(
        "structures.importStructureList",
        (planId: number, text: string): StructureListImportResult => {
            const db = getDb();
            assertWritable(db, planId);
            const rows = parseStructureList(text);

            const findSystem = db.prepare(
                "SELECT id FROM systems WHERE name = ? COLLATE NOCASE",
            );
            const existing = db.prepare(
                "SELECT 1 FROM plan_structures WHERE plan_id = ? AND system_id = ? AND name = ?",
            );
            const ins = db.prepare(
                `INSERT INTO plan_structures (plan_id, system_id, structure_type, name, location, source)
         VALUES (?, ?, ?, ?, ?, 'clipboard')`,
            );

            const result: StructureListImportResult = {
                imported: 0,
                skippedDuplicates: 0,
                unmatched: [],
            };
            db.transaction(() => {
                for (const row of rows) {
                    const system = findSystem.get(row.systemName) as
                        | { id: number }
                        | undefined;
                    if (!system) {
                        result.unmatched.push({
                            line: row.line,
                            systemName: row.systemName,
                            name: row.name,
                        });
                        continue;
                    }
                    // Checked against the DB, which already includes rows
                    // inserted earlier in this transaction.
                    if (existing.get(planId, system.id, row.name)) {
                        result.skippedDuplicates++;
                        continue;
                    }
                    const { structureType, location } = typeFromColumn(row.typeText);
                    ins.run(planId, system.id, structureType, row.name, location);
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
