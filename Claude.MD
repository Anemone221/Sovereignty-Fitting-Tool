# eveSovTool — assistant working notes

This file is the working agreement for any AI coding assistant (Claude in particular) operating in this repo. Read it before touching code.

## Project at a glance

The **application** half of the Sov Fitting Tool (SFT) — a local-only React + TypeScript tool for planning EVE Online sovereignty (sov) upgrades. No network calls, no telemetry. Licensed GPL-3.0.

This repo holds two things:

- `src/` — the React renderer.
- `core/` — the portable backend (SQLite queries, importers, DNA codec) behind a host adapter seam.

**The Electron desktop shell lives in a separate repository** (`Sov-Fitting-Tool-Desktop`), which consumes this repo as a git submodule at `react/`. `main.ts`, `preload.ts`, the better-sqlite3 connection, `seed.db`, and packaging all live there — not here. See `docs/Desktop-Wrapper-Repo-Setup.md`.

**Consequence you must internalise: you cannot run the app from this repo.** `npm run dev:web` starts Vite, but no host injects `window.evesov`, so `selectBackend()` returns `makeStubBackend()` and every data call throws. The shell renders empty. Typecheck, lint, and build are the only verification available here.

## Where to look first

1. **`docs/features/INDEX.md`** — feature docs, indexed. Always check here before exploring code or planning a feature change. Each feature doc names the schema, IPC, and critical files.
2. **`README.md`** — public-facing project page; canonical "what works today" lives in its Status section.
3. **`docs/Repository-Split-Proposal.md`** and **`docs/Desktop-Wrapper-Repo-Setup.md`** — why the repo is split and what lives where.
4. **`we-are-building-a-sharded-lemur.md`** — rolling implementation plan / roadmap. Written pre-split, so its `electron/` paths are historical.
5. **The codebase is the source of truth.** If a doc disagrees with code, fix the doc.

## Project layout

```
eveSovTool/
├── core/                          # portable backend — no Electron imports
│   ├── index.ts                   # public surface (setDb/setHost/register/…)
│   ├── registerCore.ts            # channel → handler registry
│   ├── host.ts                    # Host seam: broadcast / saveFile / fetchMarketCsv
│   ├── adjacency.ts               # stargate graph: findPath, reachableSystems
│   ├── db/
│   │   ├── Db.ts                  # Db/DbStatement interface + setDb/getDb
│   │   ├── schema.ts              # CREATE TABLE IF NOT EXISTS … (idempotent)
│   │   └── migrations.ts
│   ├── handlers/                  # one file per channel area
│   │   ├── data.ts  prefs.ts  plans.ts  exports.ts
│   │   ├── map.ts   structures.ts  moonScans.ts  marketSync.ts
│   ├── csv/importer.ts            # CSV → sov-data tables
│   ├── sde/                       # JSONL → SDE tables, dotlan URL, SVG sanitiser
│   ├── data/dnaCodec.ts           # ESOV2B / ESOV2T plan-share codec
│   └── market/                    # market types + profitability
├── src/                           # renderer (React)
│   ├── main.tsx · App.tsx · index.html · styles.css
│   ├── api/
│   │   ├── evesov.ts              # `evesov` — the typed backend the app calls
│   │   ├── backend.ts             # selectBackend(): electron host or stub
│   │   ├── electronBackend.ts     # returns window.evesov
│   │   └── stubBackend.ts         # throws BackendUnavailableError on every call
│   ├── panels/                    # one file per dock panel
│   ├── components/ · shell/ · state/   # zustand stores (UI-only)
│   ├── data/                      # pure helpers: effects, dokuwiki, exportFilename, …
│   ├── assets/                    # icons (faction, map, PI, planet)
│   └── types/index.ts             # shared DTOs + EveSovApi (the wire contract)
├── docs/features/                 # feature docs — see INDEX.md
└── vite.config.ts · tsconfig.{json,web,core}.json · eslint.config.mjs · package.json
```

`resources/` exists but is empty here — `seed.db` is a wrapper-repo artifact. There is no `outside_resources/` in this repo either; seeding happens in the wrapper.

## Conventions

### Path aliases

- `@/*` → `src/*` (renderer only).
- `@shared/*` → `src/types/*` (DTOs and `EveSovApi` — used by the renderer, `core/`, and the wrapper's preload).
- `@core/*` → `core/*` (used by `core/` itself and by the wrapper).
- Defined in `tsconfig.web.json`, `tsconfig.core.json`, and `vite.config.ts`. Don't add new aliases lightly; if you do, update all three — **and** the wrapper's `electron.vite.config.ts`.

### IPC

- Channels are dot-separated, scoped by area: `data.*`, `plans.*`, `prefs.*`, `exports.*`, `map.*`, `structures.*`, `moonScans.*`, `marketSync.*`. Plus `ping`. `windows.*` is Electron-only and lives in the wrapper.
- Register handlers with `register('area.name', fn)` in `core/handlers/<area>.ts`, exported as `register<Area>Handlers()`.
- **Handlers receive renderer arguments only.** The wrapper bridges with `ipcMain.handle(channel, (_e, ...args) => fn(...args))`, so the Electron event is already stripped. A leading `_` parameter shifts every argument by one and silently breaks the channel.
- The wrapper auto-bridges every registered handler, so adding a channel needs **no** change to its `ipc/index.ts` — but it does need a hand-written line in its `electron/preload.ts`.
- Type the wire contract in `EveSovApi` inside `src/types/index.ts`. The renderer always goes through `evesov` from `src/api/evesov.ts`, never `window.evesov` directly.
- After any DB mutation that changes plan state, broadcast `plan-changed` via `getHost().broadcast(...)`. After data refresh, broadcast `data-refreshed`. Renderers subscribe via `evesov.events.on(channel, cb)` and re-fetch.

**Checklist for a new channel:** handler in `core/handlers/<area>.ts` → type in `EveSovApi` → renderer call site → one `ipcRenderer.invoke` line in the wrapper's `preload.ts`. The wrapper's typecheck fails until that last step is done, because its preload is typed `const api: EveSovApi`.

### State

- **Persistent state**: SQLite, reached only through `core/` handlers via IPC. Survive-restart UI prefs (dock layout, active plan id, per-section collapse, etc.) live in the `preferences` table behind `prefs.get/set`.
- **Ephemeral renderer state**: `zustand` stores in `src/state/`. Keep them small; don't mirror DB state.
- One source of truth per piece of state — never duplicate something in both SQLite and a zustand store.

### CSS

- One global stylesheet at `src/styles.css`. No CSS-in-JS, no module CSS for now.
- BEM-ish naming: `.block`, `.block__element`, `.block--modifier`.
- Panel root classes match the panel name: `.detail` (SystemDetail), `.inspector` (PlanInspector), `.matrix`, `.catalog`, `.plans`, `.tree`, `.overview`, `.exports`. Add new modifiers under the existing block when extending a panel.
- Dockview ships its own theme CSS — we use `dockview-theme-abyss`.

### Database

- Schema is defined as a single string in `core/db/schema.ts` and `db.exec()`'d on every open. Every statement uses `CREATE TABLE IF NOT EXISTS`, so adding a new table is a no-op on existing user DBs.
- `core/` never opens a database itself. The host calls `setDb()` with a `Db` implementation (`core/db/Db.ts`); in the desktop app that wraps better-sqlite3, and it copies `resources/seed.db` → `userData/app.db` on first launch. Delete that file to reset.
- Use named parameters (`@planId`, `@systemId`) for queries that take more than two args — see `core/handlers/plans.ts`.
- `db.transaction(fn)` accepts only **synchronous** callbacks. Read JSONL/CSV into memory first, then run a sync transaction (see `core/sde/importer.ts`).

### Renderer environment quirks

These are constraints of the Electron host the renderer runs inside:

- **`window.prompt()` is disabled.** Always use an inline form pattern instead — `PlansPanel.tsx` is the reference (see `renamingId`/`duplicatingId` state).
- `confirm()` is allowed and used for destructive actions (delete plan, remove system).
- `alert()` works but prefer inline error rendering.

## Build & verification workflow

Everything available in this repo:

1. `npm run typecheck` — runs the Web (`tsconfig.web.json`) and Core (`tsconfig.core.json`) projects.
2. `npm run build:web` — catches Vite/React/CSS issues that a pure typecheck misses.
3. `npx eslint .` — flat config in `eslint.config.mjs`.

Don't claim a task is done until typecheck and build are green. There's no test runner configured. `.github/workflows/ci.yml` runs exactly those three commands on every push and PR to `main` — it adds no coverage you can't get locally, but a red run there is a real failure, not flakiness.

**Be honest about the verification ceiling.** Those three commands prove the code compiles and bundles — nothing more. Anything touching IPC, the database, or actual panel behaviour is unverified until it runs in the desktop wrapper. Say so plainly rather than implying a feature was exercised.

For a pure module (no React, no IPC), you can genuinely execute it here by bundling with the esbuild that ships inside Vite:

```bash
node node_modules/esbuild/bin/esbuild scratch/check.ts --bundle --platform=node \
  --format=cjs --alias:@=./src --alias:@shared=./src/types --outfile=scratch/check.cjs
node scratch/check.cjs
```

### Running the real app

From the desktop wrapper repo (sibling checkout, `Sov-Fitting-Tool-Desktop`):

```bash
cd react && git pull origin main   # bring the submodule up to your commit
cd .. && npm run dev               # electron-vite dev
```

Its `resources/seed.db` is already built, so `npm run seed` is only needed when re-importing source data. Changes under `src/` hot-reload; changes to `core/`, `main.ts`, or `preload.ts` need a restart.

Note the submodule is a **separate clone** of this repo. Work committed here is invisible to the wrapper until its `react/` checkout is moved forward. For **local** work that means `git pull` in `react/` as above — nothing is automatic on your disk. On GitHub it is: a green CI run on `main` dispatches `react-updated` to the wrapper, which re-pins `react/`, commits the pointer, and packages a BETA release. So expect the wrapper's `main` to gain a `Bump react submodule to <sha>` commit shortly after you push. See [docs/Desktop-Wrapper-Repo-Setup.md](docs/Desktop-Wrapper-Repo-Setup.md) §8.

## Desktop wrapper repo notes

Relevant when working over there, not here:

- `better-sqlite3` is a native module. **Always seed via `npm run seed`**, which runs through `electron electron/seed-entry.cjs`; running it under system Node throws `NODE_MODULE_VERSION` mismatch errors because the binary is compiled for Electron's Node.
- `npm install` already runs `electron-rebuild` (postinstall hook). Don't add a manual rebuild step to instructions; if a fresh install is broken, fix the postinstall, don't paper over it.

## Documentation policy

- Before exploring code or planning a feature, **check `docs/features/INDEX.md`**. Each entry summarises schema, IPC, and the critical files for that feature.
- Update or create the relevant doc in `docs/features/<Category>.md` whenever you add or significantly change a feature. The template is documented in `INDEX.md` (Purpose · Schema · IPC · Critical files · Key decisions · Open questions).
- Keep docs short. Link out to code; don't paste it. The codebase is canonical — docs only summarise.
- If you discover a doc disagrees with code while working on something else, fix it. Don't leave drift. Several feature docs still cite pre-split `electron/…` paths; correct the ones you touch.

## Planning policy

- Use plan mode for multi-file changes or architectural decisions.
- When more than one approach is valid, present options to the user; don't decide silently.
- Break large features into phases with explicit verification steps. The implementation plan (`we-are-building-a-sharded-lemur.md`) should reflect the agreed phasing.
- Don't preemptively scaffold work that hasn't been approved.

## Code practices

- Small, purposeful diffs. Don't refactor surrounding code unless asked.
- Default to no comments. Add a comment only when *why* is non-obvious (subtle invariant, workaround for a specific bug, hidden constraint). Don't comment what well-named code already says.
- No premature abstractions. Three similar lines beat a half-baked helper.
- Don't add try/catch for cases that can't happen. Validate at boundaries (CSV ingest, IPC arguments) and trust internal callers.
- Don't add backwards-compatibility shims for in-progress code.
- When the user supplies an absolute path, use it verbatim — don't normalise or rewrite it.
- Before starting work, check whether the branch has moved: this repo is cloned twice (here and as the wrapper's submodule), so a stale base is easy to acquire and easy to miss.

## Formatting

- Repo has no Prettier config; mimic the surrounding file. Conventions in current code:
  - 2-space indent, single quotes for strings, semicolons at statement ends.
  - Trailing commas in multi-line object/array/argument lists.
  - JSX uses double quotes for attributes; expressions use single quotes.
  - Imports grouped: external first, then `@/`/`@shared/`, then relative.
- Some older files under `src/panels/` use 4-space indent. Match the file you're in, not this list.
- After editing a file, scan it once for whitespace and import-order consistency.

## Privacy

- Do **not** include Discord usernames, real names, email addresses, or other personal attributions in code, commit messages, GitHub issues, or filenames.
- The app must remain local-only. No outbound network calls without an explicit, user-approved feature design first. (`marketSync` is the one sanctioned exception, and it goes through the `Host.fetchMarketCsv` seam.)

## What's open / what's done

- The README's Status section is the canonical "what works today".
- The implementation plan (`we-are-building-a-sharded-lemur.md`) is the rolling roadmap with pending phases.
- Don't claim completion of features still listed there as pending.
