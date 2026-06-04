import { existsSync } from 'node:fs';
import Database from 'better-sqlite3';
import type { Db } from '@core/db/Db.js';
import { SCHEMA_SQL } from '@core/db/schema.js';
import { runMigrations } from '@core/db/migrations.js';

export type DB = Database.Database;

// better-sqlite3's Database structurally matches core's Db, but TS can't prove
// generic-variance for transaction<T>(): Transaction<T>. The cast happens here
// at the single host boundary; nothing outside this file performs the cast.
function asCoreDb(db: DB): Db {
  return db as unknown as Db;
}

export function openDatabase(path: string, seedPath?: string): DB {
  const db = new Database(path);
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_SQL);
  if (seedPath && existsSync(seedPath)) {
    const seedDb = new Database(seedPath, { readonly: true });
    try {
      runMigrations(asCoreDb(db), asCoreDb(seedDb));
    } finally {
      seedDb.close();
    }
  } else {
    runMigrations(asCoreDb(db));
  }
  return db;
}
