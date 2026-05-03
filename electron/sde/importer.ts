import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import type { DB } from '../db/connection.js';
import type { ImportReport, ImportWarning } from '@shared/index';

export interface SdePaths {
  regions: string;
  constellations: string;
  solarSystems: string;
  stars: string;
  planets: string;
  types: string;
}

export interface SdeMaps {
  planetToSystem: Map<number, number>;
  starToSystem: Map<number, number>;
  starSpectralClass: Map<number, string | null>;
  planetIdToType: Map<number, string>;
}

interface RegionRow {
  _key: number;
  factionID?: number;
  name: { en: string };
}

interface ConstellationRow {
  _key: number;
  regionID: number;
  factionID?: number;
  name: { en: string };
}

interface SolarSystemRow {
  _key: number;
  constellationID: number;
  regionID: number;
  name: { en: string };
  securityStatus?: number;
  securityClass?: string;
  starID?: number;
  planetIDs?: number[];
  position?: { x: number; y: number; z: number };
}

interface StarRow {
  _key: number;
  solarSystemID: number;
  statistics?: { spectralClass?: string };
}

interface PlanetRow {
  _key: number;
  typeID: number;
}

interface TypeRow {
  _key: number;
  groupID?: number;
  name?: { en?: string };
}

const PLANET_TYPE_NAMES: Record<string, string> = {
  'Planet (Barren)': 'Barren',
  'Planet (Gas)': 'Gas',
  'Planet (Ice)': 'Ice',
  'Planet (Lava)': 'Lava',
  'Planet (Oceanic)': 'Oceanic',
  'Planet (Plasma)': 'Plasma',
  'Planet (Storm)': 'Storm',
  'Planet (Temperate)': 'Temperate',
  'Planet (Shattered)': 'Shattered',
};

interface StargateRow {
  _key: number;
  solarSystemID: number;
  destination: {
    solarSystemID: number;
    stargateID: number;
  };
}

async function readJsonl<T>(path: string): Promise<Array<{ row: T; lineNo: number }>> {
  const out: Array<{ row: T; lineNo: number }> = [];
  const stream = createReadStream(path, { encoding: 'utf8' });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  let lineNo = 0;
  for await (const line of rl) {
    lineNo++;
    const trimmed = line.trim();
    if (!trimmed) continue;
    out.push({ row: JSON.parse(trimmed) as T, lineNo });
  }
  return out;
}

export async function importSde(db: DB, paths: SdePaths): Promise<{ report: ImportReport; maps: SdeMaps }> {
  const warnings: ImportWarning[] = [];
  const counts = { regions: 0, constellations: 0, systems: 0, stars: 0 };

  const regions = await readJsonl<RegionRow>(paths.regions);
  const constellations = await readJsonl<ConstellationRow>(paths.constellations);
  const solarSystems = await readJsonl<SolarSystemRow>(paths.solarSystems);
  const stars = await readJsonl<StarRow>(paths.stars);
  const planetRows = await readJsonl<PlanetRow>(paths.planets);
  const typeRows = await readJsonl<TypeRow>(paths.types);

  const planetToSystem = new Map<number, number>();
  const starToSystem = new Map<number, number>();
  const starSpectralClass = new Map<number, string | null>();
  const planetIdToType = new Map<number, string>();

  const planetTypeIdToName = new Map<number, string>();
  for (const { row } of typeRows) {
    const en = row.name?.en;
    if (!en) continue;
    const short = PLANET_TYPE_NAMES[en];
    if (short) planetTypeIdToName.set(row._key, short);
  }
  for (const { row } of planetRows) {
    const t = planetTypeIdToName.get(row.typeID);
    if (t) planetIdToType.set(row._key, t);
  }

  const insertRegion = db.prepare(
    'INSERT OR REPLACE INTO regions (id, name, faction_id) VALUES (?, ?, ?)'
  );
  const insertConstellation = db.prepare(
    'INSERT OR REPLACE INTO constellations (id, region_id, name, faction_id) VALUES (?, ?, ?, ?)'
  );
  const insertSystem = db.prepare(
    `INSERT OR REPLACE INTO systems
       (id, constellation_id, region_id, name, security_status, security_class, x, y, z)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const txn = db.transaction(() => {
    for (const { row, lineNo } of regions) {
      try {
        insertRegion.run(row._key, row.name.en, row.factionID ?? null);
        counts.regions++;
      } catch (err) {
        warnings.push({ source: 'sde', file: paths.regions, row: lineNo, message: String(err) });
      }
    }
    for (const { row, lineNo } of constellations) {
      try {
        insertConstellation.run(row._key, row.regionID, row.name.en, row.factionID ?? null);
        counts.constellations++;
      } catch (err) {
        warnings.push({ source: 'sde', file: paths.constellations, row: lineNo, message: String(err) });
      }
    }
    for (const { row, lineNo } of solarSystems) {
      try {
        insertSystem.run(
          row._key,
          row.constellationID,
          row.regionID,
          row.name.en,
          row.securityStatus ?? null,
          row.securityClass ?? null,
          row.position?.x ?? null,
          row.position?.y ?? null,
          row.position?.z ?? null
        );
        counts.systems++;
        if (row.starID) starToSystem.set(row.starID, row._key);
        if (row.planetIDs) {
          for (const planetId of row.planetIDs) planetToSystem.set(planetId, row._key);
        }
      } catch (err) {
        warnings.push({ source: 'sde', file: paths.solarSystems, row: lineNo, message: String(err) });
      }
    }
    for (const { row } of stars) {
      starSpectralClass.set(row._key, row.statistics?.spectralClass ?? null);
      counts.stars++;
    }
  });

  txn();

  return {
    report: { counts, warnings },
    maps: { planetToSystem, starToSystem, starSpectralClass, planetIdToType }
  };
}

export async function importStargates(db: DB, path: string): Promise<ImportReport> {
  const rows = await readJsonl<StargateRow>(path);
  const warnings: ImportWarning[] = [];

  const knownSystems = new Set<number>(
    (db.prepare('SELECT id FROM systems').all() as { id: number }[]).map((r) => r.id)
  );

  const insert = db.prepare(
    'INSERT OR IGNORE INTO system_adjacency (system_id, neighbor_id) VALUES (?, ?)'
  );

  let imported = 0;

  db.transaction(() => {
    db.prepare('DELETE FROM system_adjacency').run();
    for (const { row, lineNo } of rows) {
      const src = row.solarSystemID;
      const dst = row.destination.solarSystemID;
      if (!knownSystems.has(src) || !knownSystems.has(dst)) {
        warnings.push({
          source: 'sde',
          file: path,
          row: lineNo,
          message: `skipping stargate ${row._key}: system ${src} or ${dst} not in DB`,
        });
        continue;
      }
      insert.run(src, dst);
      insert.run(dst, src);
      imported++;
    }
  })();

  return { counts: { stargates: imported }, warnings };
}
