import { register } from '../registerCore.js';
import { getDb } from '../db/Db.js';
import { getHost } from '../host.js';

const ACTIVE_PLAN_KEY = 'plan.active.v1';

export function registerPrefsHandlers(): void {
  register('prefs.get', (key: string): string | null => {
    const row = getDb()
      .prepare('SELECT value FROM preferences WHERE key = ?')
      .get(key) as { value: string } | undefined;
    return row ? row.value : null;
  });

  register('prefs.set', (key: string, value: string): void => {
    getDb()
      .prepare(
        `INSERT INTO preferences (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      )
      .run(key, value);

    if (key === ACTIVE_PLAN_KEY) {
      getHost().broadcast('plan-active-changed', { value });
    }
  });

  register('prefs.deletePrefix', (prefix: string): number => {
    const result = getDb()
      .prepare('DELETE FROM preferences WHERE key LIKE ?')
      .run(`${prefix}%`);
    return result.changes;
  });
}
