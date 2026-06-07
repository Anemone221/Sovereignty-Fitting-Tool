import { app } from 'electron';
import { chmodSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { is } from '@electron-toolkit/utils';
import { fileURLToPath } from 'node:url';
import type { Db } from '@core/db/Db.js';
import { setDb as coreSetDb, clearDb as coreClearDb } from '@core/db/Db.js';
import { openDatabase, type DB } from './connection.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

let cached: DB | null = null;

function resolveSeedPath(): string {
  if (is.dev) {
    return join(__dirname, '../../resources/seed.db');
  }
  return join(process.resourcesPath, 'seed.db');
}

function resolveUserDbPath(): string {
  return join(app.getPath('userData'), 'app.db');
}

// better-sqlite3's Database structurally satisfies the core Db interface; the
// cast is contained here so the rest of the Electron host can treat the handle
// as a plain Db throughout.
function asCoreDb(db: DB): Db {
  return db as unknown as Db;
}

export function getDb(): Db {
  if (cached) return asCoreDb(cached);
  const target = resolveUserDbPath();
  const seed = resolveSeedPath();
  if (!existsSync(target)) {
    if (!existsSync(seed)) {
      throw new Error(`seed database not found at ${seed} — run "npm run seed" first.`);
    }
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(seed, target);
    chmodSync(target, 0o644);
    console.log(`[db] copied seed → ${target}`);
  }
  cached = openDatabase(target, existsSync(seed) ? seed : undefined);
  const view = asCoreDb(cached);
  coreSetDb(view);
  return view;
}

export function closeDb(): void {
  if (cached) {
    cached.close();
    cached = null;
    coreClearDb();
  }
}
