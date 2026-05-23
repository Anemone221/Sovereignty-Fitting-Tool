# eveSovTool — Repository Split Proposal

**Status:** proposal, pending approval
**Subject:** separating the desktop app into two repositories to enable a web version
**Audience:** project stakeholders (technical and non-technical)
**Current branch:** `Strip-Electron-from-SFT-For-Split-Repository`

---

## 1. Executive summary

eveSovTool is currently a single Electron + React + TypeScript desktop application, built as
one `electron-vite` project. To make a **website version** of the tool possible, we propose
splitting the codebase into two git repositories:

1. **The application repository** (this existing repo) — keeps the React user interface
   (`src/`), gains a new portable backend (`core/`), and keeps the shared API type contract
   (`src/types/`). It becomes buildable standalone with plain Vite — the foundation the
   website builds on.
2. **A new desktop-wrapper repository** (working name `eveSovTool-desktop`) — holds only the
   thin Electron desktop shell. It consumes the application repository as a **git submodule**.

This is a **structural reorganisation**, not a feature change. The desktop application
continues to work exactly as today, at every step. The website itself is **not** built by
this work — this effort delivers the *seam* a future web data backend plugs into.

The non-trivial part: the renderer (`src/`) is already cleanly decoupled, but the ~5,400
lines of backend logic currently in `electron/ipc/` are entangled with Electron. Most of that
logic is portable (SQL, validation, rollups, importers, codecs) and must be extracted into
`core/` so it is reusable by both the desktop shell and a future web backend.

---

## 2. Why we're doing this

The application's logic and data access are currently locked inside the Electron desktop
process. A browser cannot run an Electron process, so a website version is impossible without
first separating the user interface and business logic from the desktop-specific plumbing.

The split delivers:

- **A reusable application core** runnable inside the desktop app today and, later, inside a
  browser (against a WASM SQLite database or a server API).
- **A clean adapter seam** where a future web data backend plugs in without touching the UI.
- **Two smaller, single-purpose repositories** that are easier to reason about and contribute
  to.
- **Zero disruption** to the existing desktop product.

---

## 3. Goals and non-goals

### Goals
- Split into two repositories with the application repo (this one) buildable standalone.
- Extract the portable backend logic into a `core/` directory that lives in the application
  repo and is reused by the desktop shell.
- Introduce a backend-adapter seam in the renderer so a web data source can be added later.
- Keep the desktop app fully working and shippable throughout.

### Non-goals (explicitly deferred)
- Building the actual **web data backend** (WASM SQLite, or a hosted server API). This work
  only builds the seam; the backend is a separate follow-up project.
- Any user-facing feature change, UI redesign, or data-format change.
- Multi-device sync, accounts, or any networked feature.

---

## 4. Current architecture

One `electron-vite` project produces three build targets:

- **main** (`electron/main.ts`) — Electron process: window lifecycle, owns the SQLite handle,
  registers IPC.
- **preload** (`electron/preload.ts`) — exposes a typed `window.evesov` surface via
  `contextBridge` (`contextIsolation: true`, `nodeIntegration: false`).
- **renderer** (`src/`) — the React app, talks only to `window.evesov`.

Data flow today: `renderer → window.evesov (IPC) → main process → better-sqlite3 → SQLite`.

Key facts established by code exploration:

- **The renderer is already cleanly decoupled.** Its *only* Electron touchpoint is
  `src/api/evesov.ts`:
  ```ts
  import type { EveSovApi } from '@shared/index';
  export const evesov: EveSovApi = window.evesov;
  ```
  All ~210 `evesov.*` call sites across ~21 files go through that single wrapper. There are no
  other `window.evesov`, `require`, `process`, `ipcRenderer`, or Node globals in `src/`.
- **The contract is shared.** `src/types/index.ts` (691 lines) defines the `EveSovApi`
  interface and all DTOs; it is consumed by both `electron/preload.ts` and the renderer via
  the `@shared` alias.
- **The "wrapper" is actually a full backend.** `electron/ipc/` is ~5,400 lines —
  `plans.ts` alone is 1,693 — implementing SQL queries, plan validation, resource-budget
  rollups, audits, pathfinding, the DNA import/export codec, and CSV/JSONL importers. There
  are roughly 48 IPC channels (~28 mutating, ~20 read-only).
- **DB access** is centralised: `electron/db/connection.ts` opens a `better-sqlite3` handle;
  `electron/db/userDb.ts` provides a `getDb()` singleton that copies the bundled
  `resources/seed.db` to `userData/app.db` on first run. IPC handlers call `getDb()`.

This is why "split the project" is mostly "decide where the backend logic lives and how the
website gets its data."

---

## 5. Target architecture

### 5.1 End-state repository layout

```
APPLICATION repo (this repo)              DESKTOP-WRAPPER repo (new: eveSovTool-desktop)
├── src/             renderer (React)     ├── react/      ← git submodule = application repo
├── core/            portable backend     ├── electron/
│   ├── db/Db.ts     DB interface + DI     │   ├── main.ts        window/app lifecycle
│   ├── db/schema.ts SQL schema            │   ├── preload.ts     window.evesov bridge
│   ├── db/migrations.ts                   │   ├── ipc/index.ts   adapts core → ipcMain
│   ├── host.ts      Host capability seam  │   ├── ipc/windows.ts multi-window (shell-only)
│   ├── handlers/    unwrapped IPC logic   │   ├── db/userDb.ts   seed-copy, opens sqlite
│   ├── registerCore.ts handler registry  │   ├── host/electronHost.ts  implements Host
│   ├── csv/ sde/    importers (codecs)    │   ├── windows/manager.ts
│   └── data/dnaCodec.ts                   │   └── seed* / seed-entry.cjs  build-time seed
├── src/types/       EveSovApi contract    ├── electron.vite.config.ts (points at react/)
├── vite.config.ts   NEW standalone build  ├── electron-builder*.yml
├── tsconfig.*.json                        ├── resources/seed.db   build artifact
└── package.json     web-only deps         └── package.json   native + electron deps
```

The desktop-wrapper's `electron-vite` build compiles the submodule's renderer **and** `core/`
from source. `core/` ships as source inside the submodule — no separate publish step.

### 5.2 The three seams

The split rests on three injection points so that `core/` never imports `electron` or
`better-sqlite3` as a runtime value. Each is a small, well-defined interface.

#### Seam 1 — DB-handle injection (`core/db/Db.ts`)

`core/` must not depend on the native `better-sqlite3` module. We define the minimal
synchronous interface the handlers actually use:

```ts
export interface DbStatement {
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
  run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
}
export interface Db {
  prepare(sql: string): DbStatement;
  exec(sql: string): void;
  transaction<T extends (...a: any[]) => any>(fn: T): T;
  pragma(source: string): unknown;
  close(): void;
}

let _db: Db | null = null;
export function setDb(db: Db): void { _db = db; }
export function getDb(): Db {
  if (!_db) throw new Error('core: db not initialised');
  return _db;
}
```

`better-sqlite3`'s `Database` **structurally satisfies `Db`** — the Electron host passes its
handle straight to `core.setDb(handle)` with no adapter code. Every existing handler keeps
calling `getDb()` exactly as today; only its import path changes.

The `Db` interface is **synchronous on purpose** — it matches `better-sqlite3` and the current
code. A future browser backend (WASM SQLite is async) will *not* reuse this interface; it will
implement the `EveSovApi` contract at the renderer seam instead (Seam 3). We deliberately do
not async-ify 5,400 lines now — the deferred web backend owns that cost.

#### Seam 2 — Host-capability injection (`core/host.ts`)

The handlers reach into Electron for exactly three categories of capability. Each becomes a
method on an injected `Host`:

```ts
export type BroadcastChannel =
  | 'plan-changed' | 'data-refreshed' | 'plan-active-changed';

export interface SaveFileRequest {
  title: string;
  defaultPath: string;
  filters: { name: string; extensions: string[] }[];
  bytes: Uint8Array | string;
}

export interface Host {
  broadcast(channel: BroadcastChannel, payload?: unknown): void;
  saveFile(req: SaveFileRequest): Promise<{ saved: boolean; path?: string }>;
  fetchMarketCsv(url: string): Promise<string>;
}
```

| Capability | Current Electron use | After |
| --- | --- | --- |
| Event broadcast | `BrowserWindow.getAllWindows()` → `webContents.send` | `getHost().broadcast(...)` |
| File save dialog | `dialog.showSaveDialog` + `writeFile` in `exports.ts` (l.180, 219) | `getHost().saveFile(...)` |
| Market data fetch | `electron.net` + `unbzip2-stream` in `marketSync.ts` (l.118) | `getHost().fetchMarketCsv(...)` |

`fetchMarketCsv` returns **already-decompressed** CSV text, which keeps the `bzip2`
dependency entirely inside the desktop wrapper (no portable bz2 library needed in `core/`).
The desktop wrapper provides `electron/host/electronHost.ts` implementing `Host`; it is
injected once at startup via `core.setHost(electronHost)`. The three additional renderer
events (`selected-system-changed`, `focus-panel-requested`, `add-panel-requested`) are
emitted by the shell's multi-window code, not by `core/`.

#### Seam 3 — Renderer backend adapter (`src/api/`)

`src/api/evesov.ts` stops being a bare `window.evesov` reference and instead selects a
backend:

```ts
// src/api/backend.ts
import type { EveSovApi } from '@shared/index';
export type Backend = EveSovApi;
export function selectBackend(): Backend {
  if (typeof window !== 'undefined' && window.evesov) return makeElectronBackend();
  return makeStubBackend(); // website build, until a web backend exists
}

// src/api/evesov.ts
export const evesov: Backend = selectBackend();
```

- `electronBackend.ts` — returns `window.evesov` (already a full `EveSovApi` from preload).
  A trivial wrapper, kept as a named seam so a future logging/error layer has a home.
- `stubBackend.ts` — a ~40-line `EveSovApi` whose every method throws a typed
  `BackendUnavailableError`; `events.on` returns a no-op unsubscribe. This makes a website
  build **compile and load** — the shell renders, with a clear console error — until a real
  web backend is implemented. It deliberately serves **no fake data**.

`Backend` is just an alias of `EveSovApi`: the existing contract *is* the abstraction. No DI
container, no premature async interface. All ~210 renderer call sites are unchanged.

---

## 6. Core / shell boundary

Per-file classification of everything currently under `electron/`:

| File | Lines | Destination | Note |
| --- | --- | --- | --- |
| `db/schema.ts` | — | `core/db/` verbatim | pure SQL string |
| `db/connection.ts` | 13 | **split** | `new Database()` stays shell; schema + migrations → `core.applySchema(db)` |
| `db/migrations.ts` | — | `core/db/` | retype to `Db`; readonly seed handle passed in by host |
| `db/userDb.ts` | 45 | **shell** | `app.getPath`, `process.resourcesPath`, seed-copy bootstrap |
| `data/dnaCodec.ts` | 670 | `core/data/` verbatim | uses `node:zlib` only — fine in core (never web-bundled) |
| `csv/importer.ts` | — | `core/csv/` | accept CSV *text*, not a file path |
| `sde/importer.ts` | — | `core/sde/` | split `readJsonl` (shell) from insert logic (core) |
| `sde/dotlanUrl.ts`, `sde/svgSanitize.ts` | — | `core/sde/` | `loadLegendIcons` (file reads) injected by host |
| `ipc/adjacency.ts` | 83 | `core/` verbatim | pure, takes `db` |
| `ipc/marketTypes.ts` | 103 | `core/` verbatim | constants |
| `ipc/profitability.ts` | 291 | `core/` verbatim | only a type-only better-sqlite3 import → retype `Db` |
| `ipc/map.ts` | 307 | `core/handlers/` | pure handler bodies |
| `ipc/data.ts` | 248 | `core/handlers/` | pure bodies; unwrap from `ipcMain` |
| `ipc/prefs.ts` | 35 | `core/handlers/` | + `host.broadcast('plan-active-changed')` |
| `ipc/plans.ts` | 1693 | `core/handlers/` | + `host.broadcast('plan-changed')`; all SQL pure |
| `ipc/exports.ts` | 773 | `core/handlers/` | + `host.saveFile`, `host.broadcast` |
| `ipc/structures.ts` | 229 | `core/handlers/` | + `host.broadcast('plan-changed')` |
| `ipc/moonScans.ts` | 312 | `core/handlers/` | + `host.broadcast('data-refreshed')` |
| `ipc/marketSync.ts` | 280 | `core/handlers/` | + `host.fetchMarketCsv`, `host.broadcast` |
| `ipc/windows.ts` | 149 | **shell** | entirely multi-window — stays in desktop wrapper |
| `ipc/index.ts` | 23 | replaced | becomes the `core` → `ipcMain` adapter in the wrapper |
| `main.ts`, `preload.ts`, `windows/manager.ts`, `seed*` | — | **shell** | |

**Classification key:** *verbatim* = move unchanged (import paths only); *split* = part core,
part shell, with a seam; *shell* = stays in the desktop wrapper; *core/handlers/* = the
handler body is unwrapped from `ipcMain.handle(...)` into a plain function.

The seed script (`electron/db/seed.ts`) stays in the desktop wrapper — it is build-time only
(SDE download, zip extraction, file IO). It calls the importers, which now live in `core/`,
via the submodule. No separate `core/seedPipeline` is extracted (deferred — it buys nothing
until a web backend must seed a WASM database).

---

## 7. Build and tooling changes

### 7.1 Application repo — standalone build

A new plain-Vite config sits alongside the existing setup until the desktop code is removed:

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  root: resolve(__dirname, 'src'),
  build: {
    outDir: resolve(__dirname, 'dist-web'),
    emptyOutDir: true,
    rollupOptions: { input: { index: resolve(__dirname, 'src/index.html') } },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@shared': resolve(__dirname, 'src/types'),
    },
  },
  plugins: [react()],
});
```

New `package.json` scripts: `dev:web`, `build:web`, `preview:web`, `typecheck:core`. The
existing CSP in `src/index.html` (`script-src 'self'`) is already compatible with a bundled
web build.

`core/` is **not bundled into the web build** — the renderer never imports `core/`, it talks
to a backend through the `EveSovApi` contract. In the application repo, `core/` is only
(a) source the desktop submodule consumes and (b) type-checked via a new `tsconfig.core.json`.
This is why `node:zlib` inside `core/data/dnaCodec.ts` is harmless: `core/` is only ever built
by Node/Electron, never by the browser bundle.

### 7.2 tsconfig changes

| File | Change |
| --- | --- |
| `tsconfig.web.json` | keep — covers `src/**` |
| `tsconfig.core.json` | **new** — covers `core/**`, `types: ["node"]`, `@shared` path |
| `tsconfig.node.json` | **deleted** from the application repo (it covered `electron/**`) |
| `tsconfig.json` | root references → `web` + `core` |

### 7.3 Dependency split

| Package | Goes to |
| --- | --- |
| `react`, `react-dom`, `@tanstack/react-table`, `dockview-react`, `html2canvas`, `zustand` | application repo (renderer) |
| `papaparse` | application repo (`core/` importers use it) |
| `better-sqlite3`, `unbzip2-stream`, `@electron-toolkit/*` | desktop-wrapper repo |
| `electron`, `electron-builder`, `electron-vite`, `@electron/rebuild`, `@electron/packager` | desktop-wrapper repo (dev) |

After the split the application repo has **zero native dependencies** — a clean web build.
`better-sqlite3` (the only native module) lives solely in the desktop wrapper.

### 7.4 Desktop-wrapper repo

- Includes the application repo as a submodule at `react/`.
- Its `electron.vite.config.ts` points `renderer.root` at `react/src` and sets aliases
  `@` → `react/src`, `@shared` → `react/src/types`, `@core` → `react/core` across the main,
  preload, and renderer build blocks.
- `main.ts` startup sequence: `app.whenReady` → `userDb.getDb()` (opens `better-sqlite3`,
  copies `seed.db` on first run) → `core.setDb(db)` → `core.setHost(electronHost)` →
  `registerIpc()` → `createMainWindow()`.
- `electron/ipc/index.ts` becomes a thin adapter: it loops the registry exported by
  `core/registerCore.ts` and calls `ipcMain.handle(name, (_e, ...args) => fn(...args))`, then
  also calls `registerWindowsIpc()` for the shell-only multi-window channels.
- `electron-builder*.yml`, app icons, and the seed entry point move here unchanged.
- A `postinstall` step runs `@electron/rebuild` for `better-sqlite3` against the pinned
  Electron version.

---

## 8. Implementation phases

All phases run on the current branch in the **application repo** first; the desktop-wrapper
repo is created only in Phase 4. **The desktop app builds and runs after every phase** — there
is no broken intermediate state.

### Phase 0 — Scaffold `core/` skeleton (no behaviour change)
- Create `core/db/Db.ts` (`Db` interface, `getDb`/`setDb`) and `core/host.ts` (`Host`
  interface, `setHost`/`getHost`).
- Add a `@core` alias to `electron.vite.config.ts` (all three blocks) and `tsconfig.node.json`.
- **Verify:** `npm run typecheck`, `npx electron-vite build`, `npm run dev` — app unchanged.

### Phase 1 — Move PORTABLE files into `core/` (mechanical)
- Move the verbatim / near-verbatim files from Section 6 (schema, migrations, dnaCodec,
  importers, dotlanUrl, svgSanitize, adjacency, marketTypes, profitability). Fix import paths
  only; retype better-sqlite3 type imports to `Db`.
- `electron/db/connection.ts` keeps `better-sqlite3`, calls `core.applySchema(db)`.
- Add a CI grep gate: **no runtime import of `better-sqlite3` or `electron` inside `core/`.**
- **Verify:** `npm run typecheck`, `electron-vite build`, `npm run dev`; exercise DNA
  export/import and a region map (both use moved code).
- **Risk:** low — import-path churn, caught by the type-checker.

### Phase 2 — Extract SPLIT handler bodies into `core/handlers/` (the largest phase)
- For `prefs, data, plans, exports, structures, moonScans, map, marketSync`: move each
  `ipcMain.handle('x', (_, ...args) => body)` into a plain function in
  `core/handlers/<name>.ts`, registered via `core/registerCore.ts` (a `Map<channel, fn>`).
  Keep SQL strings byte-identical.
- Replace `BrowserWindow` broadcasts → `getHost().broadcast(...)`; `dialog` + `writeFile` →
  `getHost().saveFile(...)`; `electron.net` → `getHost().fetchMarketCsv(...)`.
- Add `electron/host/electronHost.ts` implementing `Host`; `main.ts` calls `core.setDb` +
  `core.setHost` after `getDb()`. `electron/ipc/index.ts` becomes the registry→`ipcMain`
  adapter.
- **One handler file per commit.** After each: type-check, `npm run dev`, and click-test that
  feature (plans CRUD, PNG/SVG/DNA export, market sync, moon scans, structures, map overlay).
- **Risk: highest of the project** — most lines (`plans.ts` 1,693 + `exports.ts` 773), every
  user feature passes through it. Mitigation: incremental commits, byte-identical SQL,
  per-handler manual click-tests.

### Phase 3 — Renderer backend seam + standalone web build
- Add `src/api/backend.ts`, `electronBackend.ts`, `stubBackend.ts`; rewrite `evesov.ts` to
  `selectBackend()` — all ~210 call sites untouched.
- Add `vite.config.ts`, `tsconfig.core.json`; update `tsconfig.web.json` and the root
  `tsconfig.json` references; add the web scripts to `package.json`.
- **Verify:** `npm run dev` (Electron, selects ElectronBackend) still works; `npm run
  build:web` succeeds; `npm run preview:web` loads the shell with the stub backend — clear
  console error, no crash.
- **Risk:** low–medium — a bundling surprise (a renderer file transitively importing
  `node:zlib` / `better-sqlite3`) would fail `build:web` loudly and is fixed by confirming the
  offending module is core-only.

### Phase 4 — Create the desktop-wrapper repo, wire the submodule
- New repo `eveSovTool-desktop`. Move into it: `electron/`, `electron.vite.config.ts`,
  `electron-builder*.yml`, app icons, the seed entry, and the Electron `package.json` scripts
  + native/electron dependencies. Copy `LICENSE` (GPL-3.0) verbatim.
- Add the application repo as a submodule at `react/`; pin `.gitmodules` to a commit.
- In the application repo: delete `electron/`, `tsconfig.node.json`,
  `electron.vite.config.ts`, `electron-builder*.yml`; trim `package.json` to web-only deps;
  update `tsconfig.json` references and `.gitignore`.
- **Verify (desktop wrapper):** `npm ci`, `(cd react && npm ci)`, `npm run rebuild`,
  `npm run seed`, `npm run build`, `npm run dev`, `npm run package:dir`.
- **Verify (application repo):** `npm ci`, `npm run build:web`, `npm run typecheck`.
- **Risk:** medium — submodule + native-rebuild ergonomics; CI must initialise submodules and
  rebuild `better-sqlite3` for the right Electron ABI.

---

## 9. Decisions taken (sensible defaults — flag if you disagree)

- **Seed inputs** (`outside_Resources/Sov_Resources/*.csv`) move to the desktop-wrapper repo,
  since `npm run seed` runs there. The importers that consume them live in `core/`.
- **No `core/seedPipeline` extraction** — `seed.ts` stays whole in the desktop wrapper.
- **Documentation:** `we-are-building-a-sharded-lemur.md` (roadmap) and `docs/features/*.md`
  stay in the application repo; `docs/install/macos/` moves to the desktop-wrapper repo.
  `docs/features/Data-Sync-System.md` is updated after Phases 2/4 to reflect the split.
- **CI:** `.github/workflows/build_beta.yml` moves to the desktop-wrapper repo and gains a
  `git submodule update --init --recursive` step. The application repo gets a new workflow
  (web build + type-check + the `core/` import gate).
- **Licence:** GPL-3.0 propagates verbatim to the desktop-wrapper repo (it is a combined
  work). No licence change is possible without agreement from all SFT contributors.
- `node:zlib` (dnaCodec) and `papaparse` (importers) live with `core/` — both are fine
  because `core/` is only ever built by Node/Electron, never bundled into the web renderer.

---

## 10. Risks and mitigations

| Risk | Severity | Mitigation |
| --- | --- | --- |
| Phase 2 touches 5,400 lines; every feature passes through it | High | One handler per commit; byte-identical SQL; per-handler manual click-test |
| The two repos drift out of sync (contract change vs. stale submodule pin) | Medium | Submodule pinned to a commit; desktop-repo CI builds against the intended `react` commit |
| Native-module ABI: `better-sqlite3` must match the Electron version | Medium | `@electron/rebuild` in the wrapper's `postinstall` + CI; application repo has zero native deps |
| Alias drift (`@` / `@shared` / `@core`) across electron-vite's 3 blocks + both repos' tsconfigs | Medium | Documented alias matrix; type-check gates in both CIs |
| A renderer file transitively pulls in a Node-only module, breaking the web build | Low–Medium | `build:web` fails loudly; CI grep gate keeps `core/` free of `electron`/`better-sqlite3` runtime imports |
| Desktop installer regressions from the move | Medium | Phase 4 sign-off includes a full `package:dir` build and install test |

---

## 11. Open items for stakeholder input

- **Name of the new repository** — working name `eveSovTool-desktop`.
- **Confirmation** that GPL-3.0 carries to the new repository (required; recommended).
- **Hosting target for the future website** (not part of this work, but informs the eventual
  web-backend choice: in-browser WASM SQLite vs. a hosted server API).
- **Documentation ownership** — the recommendation in Section 9 (app docs stay, install docs
  move) is a default open to change.

---

## 12. Verification / acceptance criteria

The split is complete and correct when:

1. **Application repo builds standalone** — `npm run build:web` produces `dist-web/`;
   `npm run preview:web` loads the DockShell with the stub backend (visible shell, a clear
   "web backend not implemented" console error, no crash). `npm run typecheck` is green and
   the `core/` import gate passes.
2. **Desktop-wrapper repo builds and runs** — from a fresh clone: `npm ci` + submodule init +
   `npm run rebuild` + `npm run seed` yields a valid `resources/seed.db`; `npm run dev`
   launches the desktop app with full functionality (plans CRUD, exports, market sync, moon
   scans, multi-window tear-out); `npm run package:dir` produces a runnable build.
3. **No behavioural regression** — after Phase 2, every IPC-backed feature behaves identically
   to the pre-split app. The SQL is unchanged; only the transport moved.

---

## 13. Bottom line

This is foundational, low-user-risk work. It adds no features and does not change the desktop
product, but it **unlocks the website version**, removes the application repo's native-module
dependency, and leaves the project with two smaller, single-purpose repositories. The single
highest-attention item is Phase 2, contained by an incremental, test-after-every-change
approach. Once this lands, building the website becomes a well-scoped follow-up: implement one
`EveSovApi` adapter behind the seam delivered here.
