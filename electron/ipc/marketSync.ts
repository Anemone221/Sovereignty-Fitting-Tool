import { BrowserWindow, ipcMain, net } from 'electron';
import { PassThrough } from 'node:stream';
import { createInterface } from 'node:readline';
import unbzip2Stream from 'unbzip2-stream';
import { getDb } from '../db/userDb.js';
import { allTrackedTypeIds, FORGE_REGION_ID } from './marketTypes.js';

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
  // The latest dump covers the previous UTC day. Generate the last
  // MAX_DAYS_BACK completed dates in oldest-first order.
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

function fetchAndParse(url: string): Promise<{ status: number; rows: ParsedRow[] }> {
  return new Promise((resolve, reject) => {
    const req = net.request({ method: 'GET', url, redirect: 'follow' });
    req.on('response', (response) => {
      const status = response.statusCode;
      if (status !== 200) {
        // Drain to release the socket.
        response.on('data', () => {});
        response.on('end', () => resolve({ status, rows: [] }));
        return;
      }
      const rows: ParsedRow[] = [];
      // electron's IncomingMessage emits Buffer chunks via 'data' but isn't
      // a full Readable; pipe through a PassThrough so unbzip2-stream gets
      // a proper Node stream.
      const passthrough = new PassThrough();
      response.on('data', (chunk: Buffer) => passthrough.write(chunk));
      response.on('end', () => passthrough.end());
      response.on('error', (err) => passthrough.destroy(err));
      const decompressed = passthrough.pipe(unbzip2Stream());
      const rl = createInterface({ input: decompressed, crlfDelay: Infinity });
      let ix: ColumnIndex | null = null;
      rl.on('line', (line) => {
        if (ix === null) {
          ix = parseHeader(line);
          return;
        }
        const row = parseLine(line, ix);
        if (row) rows.push(row);
      });
      rl.on('close', () => resolve({ status, rows }));
      decompressed.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

function broadcastDataRefreshed(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('data-refreshed', { source: 'marketSync' });
  }
}

function readSyncedDates(): Set<string> {
  const rows = getDb()
    .prepare(`SELECT date FROM market_sync_log WHERE status = 'ok'`)
    .all() as { date: string }[];
  return new Set(rows.map((r) => r.date));
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

  for (const date of pending) {
    const url = dumpUrl(date);
    try {
      const { status, rows } = await fetchAndParse(url);
      if (status === 404) {
        recordDay(date, 0, 'missing');
        result.days.push({ date, status: 'missing', rowCount: 0 });
        continue;
      }
      if (status !== 200) {
        const err = `HTTP ${status}`;
        recordDay(date, 0, 'error');
        result.errors.push(`${date}: ${err}`);
        result.days.push({ date, status: 'error', rowCount: 0, error: err });
        continue;
      }
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

  if (result.daysFetched > 0) broadcastDataRefreshed();
  return result;
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
  broadcastDataRefreshed();
}

export function registerMarketSyncIpc(): void {
  ipcMain.handle('marketSync.run', async (): Promise<MarketSyncResult> => {
    return runMarketSync();
  });
  ipcMain.handle('marketSync.status', (): MarketSyncStatus => {
    return getMarketSyncStatus();
  });
}
