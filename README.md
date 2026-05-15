# eveSovTool

A local desktop tool for planning EVE Online sovereignty (sov) upgrades.

[![License: GPL-3.0](https://img.shields.io/badge/License-GPL_3.0-blue.svg)](LICENSE)
![Status: Beta](https://img.shields.io/badge/Status-Beta-blue.svg)
![Platform: Windows · macOS · Linux](https://img.shields.io/badge/Platform-Windows%20%C2%B7%20macOS%20%C2%B7%20Linux-lightgrey.svg)
[![Build / Beta](https://github.com/unkwntech/eveSovTool/actions/workflows/build_beta.yml/badge.svg)](https://github.com/unkwntech/eveSovTool/actions/workflows/build_beta.yml)

---

## What it is

`eveSovTool` is a desktop app for capsuleers and sov-holding alliances who want to plan, balance, and compare their sov upgrades against CCP's current sov mechanics — without standing up a spreadsheet from scratch every time.

Pick any combination of regions, constellations, and systems, drop upgrades onto them, and the tool checks every system's resource budget (Power, Workforce, Superionic Ice/h, Magmatic Gas/h) against what its planets and star can supply. Plans, layouts, and preferences are stored locally; the app never uploads or downloads anything.

## Installing

Pre-built installers for Windows, macOS, and Linux are published as artifacts on the [Build / Beta](https://github.com/unkwntech/eveSovTool/actions/workflows/build_beta.yml) workflow (every push to `main`) and on tagged releases.

### Windows

Download the installer or portable ZIP and run it. No extra steps.

### macOS

The macOS build is currently unsigned. After dragging the app to **Applications**, the first launch will fail with:

![Screenshot of MacOS Error saying "Sov Fitting Tool Is Damaged and Can't Be Opened. You Should Move It To The Trash"](/docs/install/macos/unsignederror.png)

Clear the quarantine flag from a terminal:

```bash
xattr -c /Applications/Sov\ Fitting\ Tool.app
```

Then launch normally. (Apple requires apps be [Signed & Notarized](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution); this project doesn't have a signing identity yet.)

### Linux

A `.deb` and an AppImage are published per build. Install or run them directly — no special setup required.

## Screenshots

> _Coming once the UI settles._ The activity bar gives access to: **Universe explorer**, **System detail**, **Plans**, **Plan Inspector**, **Assignment Matrix**, **Sites overview**, **Upgrade catalog**, **Region Map**, **Structures**, **Moon Scans**, and **Settings**. Panels are dockable, tear out into separate windows, and remember their layout between sessions.

## Features

### Planning

- **Universe plans** — named, multiple-coexisting plans that can scope any mix of regions, constellations, and individual systems. Duplicate a plan as `(copy)` to branch a "what if" without touching your baseline.
- **Per-system budget validation** — assign upgrades and watch the four resource bars (Power / Workforce / Superionic Ice/h / Magmatic Gas/h) fill up. The tool shows remaining capacity, flags over-budget systems, and tracks one-time startup-fuel costs separately.
- **Producer-aware** — upgrades with negative costs (e.g. workforce mecha-tooling) actually grow your available pool.
- **Sec-bracket awareness** — site grants and effects match CCP's published threat-detection tables.

### Visualisation

- **Universe explorer** — region → constellation → system tree, with sov-eligible space highlighted and NPC pirate-faction icons next to system names.
- **Plan Inspector** — your scope grouped by constellation, with per-system balance rows and inline mini-meters for constellation totals.
- **Assignment Matrix** — plan-wide grid of every system × every upgrade, with rotated headers and totals row.
- **Sites Overview** — anomalies your plan would generate (Threat Detection arrays, Prospecting Arrays, the bonus tier-3 Mercoxit anomaly) per system, plus plan-wide totals.
- **Region Map** — Dotlan SVG base map overlaid with upgrade icons, structure icons, ALN bridge lines, and an exploration aura. Pan / zoom supported.

### Structures & moons

- **Structures** — track Ansiblex, Metenox, Athanor, Tatara, Sotiyo, and others per plan/system. Manual entry, EVE clipboard import, and auto-generated Ansiblex cards when an ALN upgrade is assigned.
- **Moon Scans** — paste EVE moon survey clipboard data; per-moon ore composition feeds Metenox/Athanor/Tatara profitability calculations.
- **Workforce status** — mark systems as Local / Export / Import / Transit to drive workforce-routing logic.

### Sharing & exports

- **Plan DNA** — compact share strings (`ESOV2B` binary, `ESOV2T` text) for moving plans between installations. Legacy `ESOV1` imports are also accepted.
- **PNG export** — Matrix, Inspector, and Region Map all export to image with optional opsec redaction.
- **Markdown export** — Assignment Matrix can be exported as a markdown table.
- **Op-sec capture mode** — hide system names, workforce counts, gas/ice values, and supercap indicators in exports only; the live UI is unaffected.
- **Export log** — per-plan history of every PNG/DNA export with filename and timestamp.

### Workflow

- **Multi-window** — tear any panel out into its own native window; selections and edits stay in sync across windows via IPC events.
- **Audit tools** — surface common configuration problems in your plans (over-budget systems, missing prerequisites, etc.).
- **Plan comparison** — view two plans side by side to evaluate alternatives.
- **Data Management** — in-app upgrade-value editor, per-system resource overrides, CSV re-import, and a data-purge tool.
- **Settings** — color palettes and theme configuration.

## Status

This project is in **beta**. The data layer, plans, all core panels, exports, structures, moon scans, and multi-window are working end-to-end. Cross-platform builds (Windows installer + portable ZIP, macOS, Linux `.deb` + AppImage) are published automatically.

Still on the roadmap:

- Market data ingestion to drive structure profitability calculations.
- Workforce route validation (export ↔ import pairs and the transit chain between them).
- Per-CSV in-app refresh dialog and "Generate templates" export.
- Cross-entity search, keyboard shortcuts, drone-region site overrides.

See [`we-are-building-a-sharded-lemur.md`](we-are-building-a-sharded-lemur.md) for the full rolling implementation plan.

## Source data

The app needs three sov-data CSVs and four EVE SDE crosswalk JSONLs. Place them under `outside_resources/` before seeding:

```
outside_resources/
├── Sov_Resources/    # stars.csv · planets.csv · sovUpgardes.csv
└── SDE_Resources/    # mapRegions.jsonl · mapConstellations.jsonl
                      # mapSolarSystems.jsonl · mapStars.jsonl
```

Expected column layouts:

- `stars.csv` — `starID, regionName, System Name, Star, power`
- `planets.csv` — `planetID, Region Name, System Name, Planet Name, Power, Workforce, Superionic Ice / Hour, Magmatic Gas / Hour`
- `sovUpgardes.csv` — `Upgrade, Power, Workforce, Superionic Ice, Magmatic Gas, Startup` _(spelling preserved from CCP's source)_
- `mapRegions.jsonl`, `mapConstellations.jsonl`, `mapSolarSystems.jsonl`, `mapStars.jsonl` — from CCP's static data export.

The `outside_resources/` directory is not committed to the repo. Importers also accept a `--data <dir>` flag if you prefer a different layout. Bundling these inside a release and providing an in-app refresh / template-export dialog are tracked on the roadmap.

## Run from source

```bash
npm install          # also rebuilds better-sqlite3 for Electron via the postinstall hook
npm run seed         # produces resources/seed.db from outside_resources/
npm run dev          # launches the app
```

On first launch, `seed.db` is copied to the OS user-data folder (e.g. `%APPDATA%\eve-sov-tool\app.db` on Windows) and the app reads/writes there. Delete that file to reset to the bundled seed.

The seed step runs through Electron itself (`electron electron/seed-entry.cjs`) so it shares the same native-module ABI as the running app — no manual rebuild dance.

## Build

```bash
npm run build              # production bundle into out/
npm run package            # Windows installer + portable ZIP under dist/
npm run package:mac        # macOS build
npm run package:linux      # Linux .deb + AppImage
```

GitHub Actions builds and publishes artifacts automatically:

- **Beta** (`build_beta.yml`) — every push to `main`; produces Windows / macOS / Linux artifacts.
- **Release** (`build_release.yml`) — pushes to the `release` tag; same artifacts, stable.

## Scripts

| Script                                | What it does                                            |
| ------------------------------------- | ------------------------------------------------------- |
| `npm run dev`                         | Start the app in development mode (Vite + Electron).    |
| `npm run build`                       | Production build into `out/`.                           |
| `npm run seed`                        | Rebuild `resources/seed.db` from the CSV/JSONL sources. |
| `npm run rebuild`                     | Rebuild native modules (`better-sqlite3`) for Electron. |
| `npm run typecheck`                   | Typecheck both the Electron and renderer projects.      |
| `npm run package` / `:mac` / `:linux` | Produce installers for the named platform.              |

## Tech stack

- **Electron 41** + **electron-vite 3** — desktop shell + build pipeline.
- **React 18** + **TypeScript 5.9** — renderer.
- **Vite 6** — dev server / bundler.
- **better-sqlite3 12** — synchronous SQLite, embedded in the main process.
- **dockview-react 4** — dockable panel layout.
- **papaparse** — CSV parsing.
- **zustand** — small renderer-only state stores.
- **@tanstack/react-table** — used by the Upgrade Catalog.
- **html2canvas** — PNG exports for Matrix / Inspector / Region Map.

## Project layout

```
eveSovTool/
├── electron/             # main + preload (Node) — IPC, DB, importers
├── src/                  # renderer (React) — panels, shell, state, types
├── resources/            # bundled assets (seed.db lives here after `npm run seed`)
├── docs/features/        # per-feature design docs (see docs/features/INDEX.md)
├── outside_resources/    # source CSVs + SDE JSONLs (not committed)
├── electron.vite.config.ts
├── tsconfig*.json
└── package.json
```

## Contributing

Issues and PRs are welcome. There is no CI configured yet beyond the build workflow, so please run `npm run typecheck` and `npm run build` locally before opening a PR.

If you're using an AI coding assistant, point it at [`CLAUDE.md`](CLAUDE.md) — that's the working agreement (path aliases, IPC patterns, build workflow, native-module ABI rule, etc.) the existing code follows.

## Privacy & data handling

- No outbound data sharing. Currently the system has the ability to download SVG's from Dotlan, SDE from FC, and Market Data History from EVE Ref.

## Disclaimer

EVE Online and the EVE logo are the registered trademarks of CCP hf. All rights are reserved worldwide. This project is not affiliated with or endorsed by CCP hf.

## License

[GPL-3.0](LICENSE).
