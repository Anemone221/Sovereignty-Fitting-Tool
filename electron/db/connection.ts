import Database from 'better-sqlite3';
import { SCHEMA_SQL } from './schema.js';

export type DB = Database.Database;

interface ColumnInfo {
  name: string;
}

function migrate(db: DB): void {
  const cols = db.prepare(`PRAGMA table_info(plan_upgrades)`).all() as ColumnInfo[];
  if (!cols.some((c) => c.name === 'installed')) {
    db.exec(`ALTER TABLE plan_upgrades ADD COLUMN installed INTEGER NOT NULL DEFAULT 0`);
  }
}

export function openDatabase(path: string): DB {
  const db = new Database(path);
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_SQL);
  migrate(db);
  return db;
}
