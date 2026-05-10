# Data sync system

## Purpose
Owns the lifecycle of all static data: how the seed DB is built from CCP's CSVs and SDE JSONLs, how it's bundled and copied to user storage, and how the user will refresh it later (planned). Every panel ultimately reads from what this pipeline produces.

## Schema
Owns:

- **SDE-derived tables** (rarely change): `regions`, `constellations`, `systems`.
- **Sov-data tables** (refreshable per CSV): `stars`, `planets`, `upgrades`.
- **Convenience view** `system_budget` — joins per-system available resources and exposes `sov_eligible` (true iff the star has a `description` from `stars.csv`).

Plan tables (`plans`, `plan_scopes`, `plan_upgrades`, `plan_system_status`) are **not** owned by this pipeline and are preserved across data refreshes.

## IPC
- `data.refreshSov({ kind: 'stars'|'planets'|'upgrades', path })` — replaces a single sov-data table. *(Implementation pending — IPC surface defined in `EveSovApi`.)*
- `data.exportTemplates(dir)` — writes blank CSVs with the required headers + one example row. *(Implementation pending.)*
- `data.tree`, `data.system`, `data.region`, `data.constellation`, `data.upgrades`, `data.upgrade(name)` — read endpoints used by every other feature.

## Critical files
- `electron/db/schema.ts` — schema string. Idempotent (`CREATE TABLE IF NOT EXISTS`); applied on every DB open.
- `electron/db/connection.ts` — opens better-sqlite3 with `foreign_keys = ON` and `journal_mode = WAL`, then `db.exec(SCHEMA_SQL)`.
- `electron/db/userDb.ts` — first-run copy of `resources/seed.db` → `app.getPath('userData')/app.db`.
- `electron/db/seed.ts` — CLI entry; reads CSVs/JSONLs, calls importers in a single transaction.
- `electron/sde/importer.ts` — JSONL → SDE tables; builds in-memory `planetID → systemID` and `starID → systemID` maps.
- `electron/csv/importer.ts` — CSV → sov-data tables; uses the maps from the SDE pass to FK-bridge `starID` and `planetID` to `system_id`.
- `electron/seed-entry.cjs` — Electron-runtime wrapper for `seed.ts` so seeding shares the app's better-sqlite3 ABI.

## Key decisions
- **Seed must run via Electron**, not system Node. The `npm run seed` script is `electron electron/seed-entry.cjs`. Running `tsx electron/db/seed.ts` directly throws `NODE_MODULE_VERSION` because better-sqlite3's binary is compiled for Electron's ABI by the `postinstall` hook.
- **better-sqlite3 transactions are synchronous-only.** JSONL/CSV parsing is async; we read everything into memory first, then run a sync `db.transaction(() => …)` to apply inserts.
- **CSVs cross-check against the SDE**: rows whose `starID`/`planetID` aren't in the SDE map are skipped with a warning; rows where the CSV's `regionName`/`System Name` disagrees with the SDE's name produce a warning but still import. (Excel mangles names like `5-3722` → `May-22` — IDs are authoritative.)
- **Refresh preserves plan tables.** When per-CSV refresh ships, `DELETE FROM <table>` happens for that table only; everything in the `plan_*` namespace and `preferences` is untouched.
- **Source files live in `outside_resources/`** (not the repo root): `outside_resources/Sov_Resources/` holds `stars.csv`, `planets.csv`, `sovUpgardes.csv`; `outside_resources/SDE_Resources/` holds the four JSONL files. The directory is not committed. Importers also accept `--data <dir>` to point at any location.

## Market data sync (everef.net)

Pulls daily aggregated market history from `https://data.everef.net/market-history/<year>/market-history-YYYY-MM-DD.csv.bz2`, filters to The Forge (`region_id = 10000002`) and a fixed set of typeIDs (16 moon goos, 4 racial fuel blocks, magmatic gas), and persists per-day rows in `market_history`. Each fetched day is logged in `market_sync_log` so re-runs only download missing days within the trailing 30-day window.

- **Triggers**: manual "Sync now" button on the Settings → Data tab; plus auto-sync on launch when `settings.marketSync.onStartup = 'true'` and the last sync is older than 24h.
- **Decompression**: `unbzip2-stream` (pure JS, MIT) piped from the `electron.net` response stream.
- **Filtering happens during the line-by-line parse** so we never buffer an entire dump in memory.
- **Schema**: `market_history(type_id, region_id, date, average, highest, lowest, volume, order_count)` and `market_sync_log(date, fetched_at, row_count, status)`.
- **IPC**: `marketSync.run`, `marketSync.status`, `data.hasMarketData`, `data.purgeMarketData`, `data.priceFor(typeId)`.
- **Critical files**: [electron/ipc/marketSync.ts](../../electron/ipc/marketSync.ts), [electron/ipc/marketTypes.ts](../../electron/ipc/marketTypes.ts), [electron/ipc/profitability.ts](../../electron/ipc/profitability.ts), startup hook in [electron/main.ts](../../electron/main.ts).

## Open questions / next steps
- Wire the in-app **Refresh data** dialog (per-CSV picker, summary of imported counts + warnings).
- Wire the **Generate templates** export.
- Decide whether to also expose a "Refresh SDE" advanced flow for region/constellation/system updates after a CCP expansion.
- Bundle the source CSVs/JSONLs into the installer as a fallback so a fresh install works without the user supplying files.
- Pick the cheapest of the four racial fuel blocks per-call instead of hardcoding Nitrogen (see Structures profitability).
