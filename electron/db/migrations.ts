import type { DB } from './connection.js';

export function runMigrations(db: DB): void {
  const cols = (
    db.prepare('PRAGMA table_info(plan_system_status)').all() as { name: string }[]
  ).map((r) => r.name);

  if (!cols.includes('transfer_amount')) {
    db.exec('ALTER TABLE plan_system_status ADD COLUMN transfer_amount INTEGER NOT NULL DEFAULT 0');
  }
  if (!cols.includes('destination_system_id')) {
    db.exec('ALTER TABLE plan_system_status ADD COLUMN destination_system_id INTEGER');
  }
  if (!cols.includes('export_all_unused')) {
    db.exec('ALTER TABLE plan_system_status ADD COLUMN export_all_unused INTEGER NOT NULL DEFAULT 0');
  }
}
