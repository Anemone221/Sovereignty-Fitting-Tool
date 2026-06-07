import { register } from '../registerCore.js';
import { getDb } from '../db/Db.js';
import { getHost } from '../host.js';
import { allTrackedTypeIds, FORGE_REGION_ID } from '../market/marketTypes.js';

const TRACKED = new Set<number>(allTrackedTypeIds());
const MAX_DAYS_BACK = 30;

export interface MarketSyncDayResult {
  date: string;
  status: 'ok' | 'missing' | 'error';
  rowCount: number;
  error?: string;
}

export interface MarketSyncResult {
  daysFetched: number;
  rowsImported: number;
  errors: string[];
  days: MarketSyncDayResult[];
}

export interface MarketSyncStatus {
  lastSyncAt: string | null;
  daysCovered: number;
  latestDate: string | null;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function isoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function targetDates(): string[] {
  const dates: string[] = [];
  const today = new Date();
  for (let i = MAX_DAYS_BACK; i >= 1; i--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i));
    dates.push(isoDate(d));
  }
  return dates;
}

function dumpUrl(date: string): string {
  const year = date.slice(0, 4);
  return `https://data.everef.net/market-history/${year}/market-history-${date}.csv.bz2`;
}

interface ParsedRow {
  type_id: number;
  region_id: number;
  date: string;
  average: number;
  highest: number;
  lowest: number;
  volume: number;
  order_count: number;
}

interface ColumnIndex {
  date: number;
  region_id: number;
  type_id: number;
  average: number;
  highest: number;
  lowest: number;
  volume: number;
  order_count: number;
}

function parseHeader(line: string): ColumnIndex | null {
  const cols = line.split(',').map((c) => c.trim());
  const idx = (name: string) => cols.indexOf(name);
  const ix: ColumnIndex = {
    date: idx('date'),
    region_id: idx('region_id'),
    type_id: idx('type_id'),
    average: idx('average'),
    highest: idx('highest'),
    lowest: idx('lowest'),
    volume: idx('volume'),
    order_count: idx('order_count'),
  };
  for (const v of Object.values(ix)) {
    if (v < 0) return null;
  }
  return ix;
}

function parseLine(line: string, ix: ColumnIndex): ParsedRow | null {
  if (!line) return null;
  const cols = line.split(',');
  const region_id = Number(cols[ix.region_id]);
  if (region_id !== FORGE_REGION_ID) return null;
  const type_id = Number(cols[ix.type_id]);
  if (!TRACKED.has(type_id)) return null;
  return {
    date: cols[ix.date],
    region_id,
    type_id,
    average: Number(cols[ix.average]),
    highest: Number(cols[ix.highest]),
    lowest: Number(cols[ix.lowest]),
    volume: Number(cols[ix.volume]),
    order_count: Number(cols[ix.order_count]),
  };
}

function parseCsv(text: string): ParsedRow[] {
  const rows: ParsedRow[] = [];
  const lines = text.split(/\r?\n/);
  let ix: ColumnIndex | null = null;
  for (const line of lines) {
    if (ix === null) {
      ix = parseHeader(line);
      if (ix === null) {
        // No usable header found; bail rather than mis-parse the body.
        return [];
      }
      continue;
    }
    const row = parseLine(line, ix);
    if (row) rows.push(row);
  }
  return rows;
}

function readSyncedDates(): Set<string> {
  const rows = getDb()
    .prepare(`SELECT date FROM market_sync_log WHERE status = 'ok'`)
    .all() as { date: string }[];
  return new Set(rows.map((r) => r.date));
}

function insertRows(rows: ParsedRow[]): void {
  if (rows.length === 0) return;
  const db = getDb();
  const stmt = db.prepare(
    `INSERT INTO market_history
       (type_id, region_id, date, average, highest, lowest, volume, order_count)
     VALUES (@type_id, @region_id, @date, @average, @highest, @lowest, @volume, @order_count)
     ON CONFLICT(type_id, region_id, date) DO UPDATE SET
       average = excluded.average,
       highest = excluded.highest,
       lowest = excluded.lowest,
       volume = excluded.volume,
       order_count = excluded.order_count`,
  );
  const tx = db.transaction((batch: ParsedRow[]) => {
    for (const r of batch) stmt.run(r);
  });
  tx(rows);
}

function recordDay(date: string, rowCount: number, status: 'ok' | 'missing' | 'error'): void {
  getDb()
    .prepare(
      `INSERT INTO market_sync_log (date, fetched_at, row_count, status)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(date) DO UPDATE SET
         fetched_at = excluded.fetched_at,
         row_count = excluded.row_count,
         status = excluded.status`,
    )
    .run(date, new Date().toISOString(), rowCount, status);
}

export async function runMarketSync(): Promise<MarketSyncResult> {
  const dates = targetDates();
  const synced = readSyncedDates();
  const pending = dates.filter((d) => !synced.has(d));
  const result: MarketSyncResult = {
    daysFetched: 0,
    rowsImported: 0,
    errors: [],
    days: [],
  };

  const host = getHost();

  for (const date of pending) {
    const url = dumpUrl(date);
    try {
      const fetched = await host.fetchMarketCsv(url);
      if (fetched.status === 404) {
        recordDay(date, 0, 'missing');
        result.days.push({ date, status: 'missing', rowCount: 0 });
        continue;
      }
      if (fetched.status !== 200 || !fetched.text) {
        const err = `HTTP ${fetched.status}`;
        recordDay(date, 0, 'error');
        result.errors.push(`${date}: ${err}`);
        result.days.push({ date, status: 'error', rowCount: 0, error: err });
        continue;
      }
      const rows = parseCsv(fetched.text);
      insertRows(rows);
      recordDay(date, rows.length, 'ok');
      result.daysFetched += 1;
      result.rowsImported += rows.length;
      result.days.push({ date, status: 'ok', rowCount: rows.length });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      recordDay(date, 0, 'error');
      result.errors.push(`${date}: ${message}`);
      result.days.push({ date, status: 'error', rowCount: 0, error: message });
    }
  }

  if (result.daysFetched > 0) host.broadcast('data-refreshed', { source: 'marketSync' });
  return result;
}

export function getMarketSyncStatus(): MarketSyncStatus {
  const db = getDb();
  const last = db
    .prepare(`SELECT fetched_at FROM market_sync_log ORDER BY fetched_at DESC LIMIT 1`)
    .get() as { fetched_at: string } | undefined;
  const daysRow = db
    .prepare(`SELECT COUNT(*) AS n FROM market_sync_log WHERE status = 'ok'`)
    .get() as { n: number };
  const latestRow = db
    .prepare(
      `SELECT date FROM market_sync_log WHERE status = 'ok' ORDER BY date DESC LIMIT 1`,
    )
    .get() as { date: string } | undefined;
  return {
    lastSyncAt: last ? last.fetched_at : null,
    daysCovered: daysRow.n,
    latestDate: latestRow ? latestRow.date : null,
  };
}

export function purgeMarketData(): void {
  const db = getDb();
  db.transaction(() => {
    db.prepare('DELETE FROM market_history').run();
    db.prepare('DELETE FROM market_sync_log').run();
  })();
  getHost().broadcast('data-refreshed', { source: 'marketSync' });
}

export function registerMarketSyncHandlers(): void {
  register('marketSync.run', async (): Promise<MarketSyncResult> => runMarketSync());
  register('marketSync.status', (): MarketSyncStatus => getMarketSyncStatus());
}
