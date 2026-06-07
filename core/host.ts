export type BroadcastChannel =
  | 'plan-changed'
  | 'data-refreshed'
  | 'plan-active-changed';

export interface SaveFileRequest {
  title: string;
  defaultPath: string;
  filters: { name: string; extensions: string[] }[];
  bytes: Uint8Array | string;
  /** When set, ensure the saved path ends with `.${forceExtension}`. */
  forceExtension?: string;
}

export interface SaveFileResult {
  saved: boolean;
  path?: string;
}

export interface FetchMarketCsvResult {
  /** HTTP status (200 ok, 404 missing dump, other = error). */
  status: number;
  /** Decompressed CSV text. Present only when status === 200. */
  text?: string;
}

export interface Host {
  broadcast(channel: BroadcastChannel, payload?: unknown): void;
  saveFile(req: SaveFileRequest): Promise<SaveFileResult>;
  /** Fetch a bz2-compressed market history dump and return the decompressed CSV. */
  fetchMarketCsv(url: string): Promise<FetchMarketCsvResult>;
}

let _host: Host | null = null;

export function setHost(host: Host): void {
  _host = host;
}

export function getHost(): Host {
  if (!_host) throw new Error('core: host not initialised — host must call setHost() before invoking handlers');
  return _host;
}

export function clearHost(): void {
  _host = null;
}
