export interface DbStatement {
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
  run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
}

// Mirrors better-sqlite3's Transaction<T> = T & { default, deferred, immediate, exclusive }
// so a better-sqlite3 Database satisfies this Db interface structurally with no adapter.
export type DbTransaction<T extends (...args: any[]) => any> = T & {
  default(...params: Parameters<T>): ReturnType<T>;
  deferred(...params: Parameters<T>): ReturnType<T>;
  immediate(...params: Parameters<T>): ReturnType<T>;
  exclusive(...params: Parameters<T>): ReturnType<T>;
};

export interface Db {
  prepare(sql: string): DbStatement;
  exec(sql: string): void;
  transaction<T extends (...args: any[]) => any>(fn: T): DbTransaction<T>;
  pragma(source: string, options?: { simple?: boolean }): unknown;
  close(): void;
}

let _db: Db | null = null;

export function setDb(db: Db): void {
  _db = db;
}

export function getDb(): Db {
  if (!_db) throw new Error('core: db not initialised — host must call setDb() before invoking handlers');
  return _db;
}

export function clearDb(): void {
  _db = null;
}
