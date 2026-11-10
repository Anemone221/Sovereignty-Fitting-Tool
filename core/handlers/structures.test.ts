import { DatabaseSync } from 'node:sqlite';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type {
    StructureImportItem,
    StructureImportPreviewRow,
    StructureListImportResult,
} from '@shared/index';
import { setDb, type Db, type DbTransaction } from '../db/Db.js';
import { SCHEMA_SQL } from '../db/schema.js';
import { setHost, type BroadcastChannel } from '../host.js';
import { clearHandlers, listHandlers } from '../registerCore.js';
import { registerStructuresHandlers } from './structures.js';

/**
 * Wraps Node's built-in SQLite as the core Db interface. better-sqlite3 in
 * this workspace is compiled for Electron, so it can't load under vitest.
 */
function memoryDb(): Db {
    const raw = new DatabaseSync(':memory:');
    return {
        prepare: (sql) => raw.prepare(sql) as unknown as ReturnType<Db['prepare']>,
        exec: (sql) => raw.exec(sql),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- must match Db.transaction's signature
        transaction<T extends (...args: any[]) => any>(fn: T): DbTransaction<T> {
            const run = ((...args: Parameters<T>) => {
                raw.exec('BEGIN');
                try {
                    const r = fn(...args);
                    raw.exec('COMMIT');
                    return r;
                } catch (e) {
                    raw.exec('ROLLBACK');
                    throw e;
                }
            }) as DbTransaction<T>;
            run.default = run.deferred = run.immediate = run.exclusive = run;
            return run;
        },
        pragma: () => undefined,
        close: () => raw.close(),
    };
}

// Regions / constellations / systems from the user's sample paste.
const PURE_BLIND = 10000023;
const DEKLEIN = 10000035;
const FADE = 10000046;
const SYSTEMS: [id: number, name: string, regionId: number][] = [
    [1, 'B8EN-S', PURE_BLIND],
    [2, 'EL8-4Q', PURE_BLIND],
    [3, 'ZKYV-W', PURE_BLIND],
    [4, 'CCP-US', DEKLEIN],
    [5, 'DKUK-G', DEKLEIN],
    [6, 'E-9ORY', FADE],
];

const S = '    ';
function paste(...rows: [system: string, region: string, name: string, type: string | null][]): string {
    return rows
        .flatMap(([system, region, name, type]) => [
            ['Shield (Vulnerable)', region, system].join(S),
            name,
            'TEST Infrastructure as a Service logo',
            'TEST Infrastructure as a Service',
            ...(type ? [[type, '3w', 'No', 'No', '-', '-'].join(S)] : []),
            'Synced',
        ])
        .join('\n');
}

let db: Db;
let broadcasts: BroadcastChannel[];
const PLAN = 1;

function call<T>(channel: string, ...args: unknown[]): T {
    const handler = listHandlers().get(channel);
    if (!handler) throw new Error(`no handler ${channel}`);
    return handler(...args) as T;
}
const preview = (text: string) =>
    call<StructureImportPreviewRow[]>('structures.previewStructureList', PLAN, text);
const importItems = (items: StructureImportItem[]) =>
    call<StructureListImportResult>('structures.importStructureList', PLAN, items);
const toItems = (rows: StructureImportPreviewRow[]): StructureImportItem[] =>
    rows.map((r) => ({ systemId: r.systemId!, name: r.name, typeText: r.typeText }));
const planStructures = () =>
    db
        .prepare('SELECT system_id, name, structure_type, location, source FROM plan_structures ORDER BY id')
        .all() as { system_id: number; name: string; structure_type: string; location: string | null; source: string }[];

beforeAll(() => {
    clearHandlers();
    registerStructuresHandlers();
});

beforeEach(() => {
    db = memoryDb();
    db.exec(SCHEMA_SQL.replace(/PRAGMA journal_mode = WAL;/, ''));
    const now = '2026-11-09T00:00:00Z';
    for (const [id, name] of [[PURE_BLIND, 'Pure Blind'], [DEKLEIN, 'Deklein'], [FADE, 'Fade']] as const) {
        db.prepare('INSERT INTO regions (id, name) VALUES (?, ?)').run(id, name);
        db.prepare('INSERT INTO constellations (id, region_id, name) VALUES (?, ?, ?)').run(id + 1, id, `${name} C`);
    }
    for (const [id, name, regionId] of SYSTEMS) {
        db.prepare('INSERT INTO systems (id, constellation_id, region_id, name) VALUES (?, ?, ?, ?)').run(
            id, regionId + 1, regionId, name,
        );
    }
    db.prepare('INSERT INTO plans (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(PLAN, 'Test', now, now);
    setDb(db);
    broadcasts = [];
    setHost({
        broadcast: (channel) => void broadcasts.push(channel),
        saveFile: async () => ({ canceled: true }) as never,
        fetchMarketCsv: async () => ({}) as never,
    });
});

function scopeRegion(regionId: number) {
    db.prepare("INSERT INTO plan_scopes (plan_id, scope_type, scope_id) VALUES (?, 'region', ?)").run(PLAN, regionId);
}

describe('structures.previewStructureList', () => {
    it('classifies rows by plan region, duplicates and unknown systems', () => {
        scopeRegion(PURE_BLIND);
        db.prepare(
            "INSERT INTO plan_structures (plan_id, system_id, structure_type, name) VALUES (?, 2, 'Fortizar', ?)",
        ).run(PLAN, 'EL8-4Q - Constellation Center');

        const rows = preview(
            paste(
                ['B8EN-S', 'Pure Blind', "B8EN-S - Squad V's Pain", 'Fortizar'],
                ['EL8-4Q', 'Pure Blind', 'EL8-4Q - Constellation Center', 'Fortizar'],
                ['DKUK-G', 'Deklein', 'DKUK-G - Tuda', 'Fortizar'],
                ['XYZ-12', 'Nowhere', 'XYZ-12 - Typo', 'Fortizar'],
                ['b8en-s', 'Pure Blind', "B8EN-S - Squad V's Pain", 'Fortizar'],
            ),
        );

        expect(rows.map((r) => [r.systemName, r.regionName, r.status])).toEqual([
            ['B8EN-S', 'Pure Blind', 'new'],
            ['EL8-4Q', 'Pure Blind', 'duplicate'],
            ['DKUK-G', 'Deklein', 'outsidePlan'],
            ['XYZ-12', null, 'unknownSystem'],
            // Same system (case-insensitive) and exact name, earlier in the paste.
            ['b8en-s', 'Pure Blind', 'duplicate'],
        ]);
        expect(rows[0]).toMatchObject({ systemId: 1, structureType: 'Fortizar', location: 'Deep' });
        expect(planStructures()).toHaveLength(1); // preview writes nothing
        expect(broadcasts).toEqual([]);
    });

    it('counts constellation and system scopes towards plan regions', () => {
        db.prepare("INSERT INTO plan_scopes (plan_id, scope_type, scope_id) VALUES (?, 'constellation', ?)").run(PLAN, DEKLEIN + 1);
        db.prepare("INSERT INTO plan_scopes (plan_id, scope_type, scope_id) VALUES (?, 'system', 6)").run(PLAN);
        const rows = preview(
            paste(
                ['CCP-US', 'Deklein', 'CCP-US - 11-1', 'Metenox Moon Drill'],
                ['E-9ORY', 'Fade', 'E-9ORY - Oxygen 4 All', 'Fortizar'],
                ['B8EN-S', 'Pure Blind', "B8EN-S - Squad V's Pain", 'Fortizar'],
            ),
        );
        expect(rows.map((r) => r.status)).toEqual(['new', 'new', 'outsidePlan']);
        expect(rows[0]).toMatchObject({ structureType: 'Metenox', location: 'Moon' });
    });

    it('treats everything as in-plan when the plan covers no regions', () => {
        const rows = preview(paste(['DKUK-G', 'Deklein', 'DKUK-G - Tuda', 'Fortizar']));
        expect(rows[0].status).toBe('new');
    });

    it('takes the type from the Type column only', () => {
        const rows = preview(
            paste(
                ['B8EN-S', 'Pure Blind', 'Keepstar Party', 'Astrahus'],
                ['EL8-4Q', 'Pure Blind', 'EL8-4Q - Metenox Name', null],
            ),
        );
        expect(rows.map((r) => [r.structureType, r.location])).toEqual([
            ['Astrahus', 'Deep'],
            ['Other', null],
        ]);
    });
});

describe('structures.importStructureList', () => {
    it('imports the selected rows and broadcasts once', () => {
        scopeRegion(PURE_BLIND);
        const rows = preview(
            paste(
                ['B8EN-S', 'Pure Blind', "B8EN-S - Squad V's Pain", 'Fortizar'],
                ['DKUK-G', 'Deklein', 'DKUK-G - Tuda', 'Fortizar'],
                ['ZKYV-W', 'Pure Blind', 'ZKYV-W - Dreddit is recruiting', 'Metenox Moon Drill'],
            ),
        );
        // User unticks ZKYV-W and ticks the outside-plan DKUK-G.
        const res = importItems(toItems([rows[0], rows[1]]));

        expect(res).toEqual({ imported: 2, skippedDuplicates: 0 });
        expect(planStructures()).toEqual([
            { system_id: 1, name: "B8EN-S - Squad V's Pain", structure_type: 'Fortizar', location: 'Deep', source: 'clipboard' },
            { system_id: 5, name: 'DKUK-G - Tuda', structure_type: 'Fortizar', location: 'Deep', source: 'clipboard' },
        ]);
        expect(broadcasts).toEqual(['plan-changed']);
    });

    it('skips rows that became duplicates since the review', () => {
        const rows = preview(paste(['B8EN-S', 'Pure Blind', "B8EN-S - Squad V's Pain", 'Fortizar']));
        expect(importItems(toItems(rows))).toEqual({ imported: 1, skippedDuplicates: 0 });
        expect(importItems(toItems(rows))).toEqual({ imported: 0, skippedDuplicates: 1 });
        // Same item twice in one call.
        expect(importItems([...toItems(rows), ...toItems(rows)])).toEqual({ imported: 0, skippedDuplicates: 2 });
        expect(planStructures()).toHaveLength(1);
        expect(broadcasts).toEqual(['plan-changed']);
    });

    it('ignores unknown system ids and empty names', () => {
        const res = importItems([
            { systemId: 999, name: 'Nope', typeText: 'Fortizar' },
            { systemId: 1, name: '   ', typeText: 'Fortizar' },
        ]);
        expect(res).toEqual({ imported: 0, skippedDuplicates: 0 });
        expect(broadcasts).toEqual([]);
    });

    it('refuses a read-only plan', () => {
        db.prepare('UPDATE plans SET read_only = 1 WHERE id = ?').run(PLAN);
        expect(() => importItems([{ systemId: 1, name: 'X', typeText: null }])).toThrow('Plan is read-only');
        expect(planStructures()).toHaveLength(0);
    });
});
