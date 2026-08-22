# Exports

## Purpose
Centralised dock panel for shipping a plan: PNG captures of Matrix / Sites / Region Map (individual or bulk), DNA share strings for plan portability, a DokuWiki page generator for pasting a plan onto a corp/alliance wiki, an op-sec layer that redacts sensitive fields before each capture, and a per-plan history of past exports.

## Schema

```sql
CREATE TABLE export_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id       INTEGER REFERENCES plans(id) ON DELETE SET NULL,
  plan_name     TEXT    NOT NULL,
  export_type   TEXT    NOT NULL,   -- 'png-matrix' | 'png-sites' | 'png-regionMap' | 'png-inspector'
                                    -- | 'dna-export' | 'dna-import' | 'text-wiki'
  panel         TEXT,
  system_name   TEXT,
  filename      TEXT,
  opsec_preset  TEXT,
  exported_at   TEXT    NOT NULL
);

CREATE TABLE export_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE opsec_presets (
  name        TEXT PRIMARY KEY,
  flags_json  TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
```

`export_config` keys (`'1'`/`'0'`):
`opsec.workforce.{hidePercent,hideCount,hideVisual}`,
`opsec.power.{hidePercent,hideCount,hideVisual}`,
`opsec.{hideSupercaps,hideSystemEffects,hideTransferRoute,hideGasIceBalance,hideSystemNames,hideMoonScans,hideMapIcons}`.

## IPC

- `exports.capturePng(filename, dataUrl, meta?)` — write PNG via save dialog; if `meta.planName` is set, append an `export_log` row.
- `exports.captureText(filename, text, meta?)` — write a `.txt` via save dialog; logs `text-${meta.panel}`. Generic (text + filename), not wiki-specific.
- `exports.list(planId?)` → `ExportLogEntry[]` (newest first).
- `exports.deleteLog(id)`.
- `exports.getConfig()` / `exports.setConfig(key, value)` — opsec flags.
- `exports.exportDna(planId)` → `{ dna }` — emits compact `ESOV2B` form. Logs `dna-export`.
- `exports.exportDnaText(planId)` → `{ dna }` — emits human-readable `ESOV2T` form. Logs `dna-export-text`.
- `exports.importDna(dna)` → `{ planId, name }` — accepts `ESOV1`, `ESOV2B`, or `ESOV2T`. Strict validation, all-or-nothing transaction. Logs `dna-import`. Broadcasts `plan-changed`.
- `exports.listOpsecPresets()` → `OpsecPresetEntry[]` — user-saved opsec presets, sorted by name.
- `exports.saveOpsecPreset(name, flags)` — UPSERT a named preset. Name must match `^[\w\s\-_.()]+$`, length ≤ 64, and not be one of the reserved built-in names (`public`, `internal`, `none`, `custom`).
- `exports.deleteOpsecPreset(name)` — remove a user preset (reserved names rejected).

## DNA formats

Three formats are recognised on import; v2 is the only one the app emits.

### `ESOV2B` (binary, default emit)

`'ESOV2B' + base64url(deflateRaw(payload))`. The deflated payload is a tagged binary stream:

```
u8 version(=2)
u8 flags                       // bit0 includeScopes, bit1 includeCapitals
varint nameLen + name (UTF-8)
varint systemCount
  per system:
    varint  systemId
    u32     stateMask          // family-packed, see slot table below
    u8      statusByte         // bit0..1 status, bit2 exportAllUnused,
                               // bit3 hasDest, bit4 hasTransfer,
                               // bit5 isCapital, bit6 hasAln, bit7 reserved
    if hasTransfer:  varint transferAmount
    if hasDest:      varint destinationSystemId
    if hasAln:       varint alnLinkedSystemId
varint scopeCount
  per scope: u8 scopeType + varint scopeId
```

**Family slot table (u32 stateMask layout, LSB→MSB):**

| Bits | Slot | States |
|---|---|---|
| 0..1 | threat-minor | 0..3 (none + tiers 1-3) |
| 2..3 | threat-major | 0..3 |
| 4..5 | prospecting-tritanium | 0..3 |
| 6..7 | prospecting-pyerite | 0..3 |
| 8..9 | prospecting-mexallon | 0..3 |
| 10..11 | prospecting-isogen | 0..3 |
| 12..13 | prospecting-nocxium | 0..3 |
| 14..15 | prospecting-zydrine | 0..3 |
| 16..17 | prospecting-megacyte | 0..3 |
| 18..19 | workforce | 0..3 |
| 20..21 | power | 0..3 |
| 22..23 | exploration-detector | 0..3 |
| 24..26 | stability | 0=none, 1=Electric, 2=Exotic, 3=Gamma, 4=Plasma |
| 27 | advanced-logistics-network | toggle |
| 28 | cynosural-navigation | toggle |
| 29 | cynosural-suppression | toggle |
| 30 | supercapital-construction | toggle |

Total bits used: 31. Two prospecting tiers in one system are unrepresentable, giving free family-exclusivity validation at decode time.

### `ESOV2T` (text)

Human-readable mirror of the binary. Header `ESOV2T v=2`, then `n=<plan>`, `scope=<type> <id>`, and per-system `sys <id>` blocks containing `up=<slot>[=<value>]`, `status=<code> [amt=N] [dest=N] [all=1]`, optional `cap`, optional `aln=<id>`. Lines are trimmed; blank lines and `#` comments ignored; unknown directives rejected.

### `ESOV2 lossiness vs `ESOV1`

`ESOV2` does **not** preserve `plan_upgrades.installed` or `plan_upgrades.ordering`. Imported upgrades are written with `installed = 1` and a fresh sequential ordering in slot-table order. Per-upgrade install state and build-queue order are deliberately out of scope; bulk install/uninstall affordances live in the UI.

### `ESOV1` (legacy, accepted on import)

`'ESOV1' + base64(JSON)` with the original payload shape `{ v: 1, n, s, u, st, cap, aln }`. Still accepted by `exports.importDna`; never emitted.

## Import hardening

- Size caps: 256 KB raw DNA, 1 MB decoded JSON.
- `JSON.parse` only — no `eval`, no `Function`, no template execution.
- Strict tuple-arity / type / range checks (see `validateDnaPayload` in [core/handlers/exports.ts](../../core/handlers/exports.ts)).
- Every `systemId` / `scopeId` / `linkedSystemId` / `destinationSystemId` / capital must resolve in the local SDE tables. Every `upgradeName` must exist in the local `upgrades` table.
- Plan name allow-list `^[\w\s\-_.()]+$` rejects path separators, control chars, HTML.
- All DB writes use parameterised statements; all rendering goes through React text nodes (no `dangerouslySetInnerHTML`).
- Single `db.transaction` — any validation failure aborts before any row is written.
- Name collision: suffix `(imported)` / `(imported 2)` rather than overwrite.

## DokuWiki export

The "DokuWiki page" card generates one wiki page describing the active plan, in
[DokuWiki markup](https://www.dokuwiki.org/wiki:syntax). Generation lives in
[src/data/dokuwiki.ts](../../src/data/dokuwiki.ts) — a pure module with no React, IPC, or DOM
dependency. Delivery is clipboard (`navigator.clipboard.writeText`) or `.txt` via
`exports.captureText`.

Sections are individually toggleable; the toggles persist under the `exports.wiki.` prefs prefix.

| Section | Source | Content |
| --- | --- | --- |
| `summary` | `plans.summary` → `totals` | Consumed vs available Power / Workforce / Ice-h / Gas-h, startup fuel, system + over-budget counts |
| `matrix` | `plans.matrix` | Systems × upgrade columns, `●` installed / `○` planned. Columns are the upgrades actually present in the plan, sorted by `CATEGORY_ORDER` then name |
| `sitesCombat` | `plans.matrix` + `siteEffectsFor` | Systems × combat anomalies (Threat Detection Arrays) with a totals row |
| `sitesMining` | `plans.matrix` + `siteEffectsFor` | Systems × ore sites (Prospecting Arrays, incl. the tier-3 Mercoxit anomaly) with a totals row |
| `sitesCombined` | `plans.matrix` + `siteEffectsFor` | Both of the above in one table |
| `systems` | `plans.summary` → `systemBalances` | Grouped by `region / constellation`, per-system upgrade list + balance table |
| `structures` | `structures.list` | System / type / name / location |
| `moons` | `moonScans.list` narrowed by `plans.getSystemIds` | Per-system moon / planet / ore / share |
| `workforce` | `plans.getWorkforceTransfers` + `alnLink` | Transfer table and ALN link table |

### Combat vs mining split

Threat Detection Arrays are the only source of combat anomalies and Prospecting Arrays the
only source of ore sites — every other upgrade returns no grants from `siteEffectsFor`. So the
split keys off `categoryOf(upgradeName)`: `Military` → combat, `Industry` → mining. All three
matrices share one `renderSiteMatrix` helper, differing only in the kinds they admit.

Rows are omitted when a system contributes nothing to that matrix, so the mining table doesn't
carry a row of blanks for every pure-ratting system.

### Markup rules

- Headings are **inverted** — `====== h1 ======` is the biggest, `== h5 ==` the smallest.
- `|` and `^` inside a cell are wrapped in `%%…%%` nowiki markers; an unescaped one would
  terminate the cell. Newlines become `\\`.
- Numeric columns are right-aligned using DokuWiki's leading-whitespace convention.

### Op-sec mapping

| Flag | Effect |
| --- | --- |
| `hideSystemNames` | `System-N`, numbered in matrix order so it matches AssignmentMatrix / SitesOverview |
| `powerHideCount` / `workforceHideCount` | those counts render as `—` |
| `powerHidePercent` / `workforceHidePercent` | those percentages render as `—`; the `Used` column is dropped only when every percent flag is set |
| `hideGasIceBalance` | ice/gas counts and percentages render as `—` |
| `hideSupercaps` | Supercapital Construction Facilities dropped from every listing and column |
| `hideSystemEffects` | stability-generator upgrades dropped |
| `hideMoonScans` | moons section omitted |
| `hideTransferRoute` | workforce **transfer** table omitted |
| `hideJumpBridges` | **ALN link** table omitted — the textual equivalent of the map's bridge lines |
| `hideStationIcons` / `hideUpgradeIcons` / `*HideVisual` | no effect; these are visual-only flags with no text equivalent |

## Op-sec capture mode

Op-sec flags do NOT affect live UI. They are applied only while a capture is in flight, via `withOpsecCapture` (in [src/data/opsecCapture.ts](../../src/data/opsecCapture.ts)) which sets `useOpsec.captureActive = true`, awaits two animation frames so the redacted DOM is committed, runs the capture, then resets. Each per-panel export wraps its capture this way.

`OpsecRoot` (in [src/components/OpsecRoot.tsx](../../src/components/OpsecRoot.tsx)) reflects the *effective* (capture-time) flags onto `<body>` as `data-opsec-*` attributes; CSS rules in [src/styles.css](../../src/styles.css) drive most redactions for the html2canvas-based panels (Matrix, Sites, Inspector, SystemDetail).

Three redaction layers, depending on what's being captured:

1. **CSS via body attributes** — works for html2canvas captures where the DOM is rendered inside the document body (Matrix, Sites, Inspector, SystemDetail moon section). Examples: `.status-tag`, `.matrix__transfer-route`, `[data-supercap="1"]`, `[data-opsec-moon="1"]`, `.effect-badge__icon` inside `.overview` / `.inspector`.
2. **Text substitution via `useEffectiveOpsec()`** — components rewrite text nodes (system names → `System-N`, constellation names → `Constellation-N`). Used by AssignmentMatrix, SitesOverview, PlanInspector.
3. **Imperative SVG scrubbing** — RegionMap's PNG/SVG export paths render a *cloned* SVG standalone (via an `<img>` data URL or direct serialisation), so body-level CSS does NOT apply. `applyRegionMapOpsec(clone)` mutates the clone before serialisation: removes `<image>` icons under `#evesov-overlay` (when `hideMapIcons` or `hideSupercaps`), removes `.evesov-moon-label` text (when `hideMoonScans`), and rewrites dotlan system-name `<text>` nodes to `Sys-N` (when `hideSystemNames`). The live SVG is never touched.

The pill (`<OpsecPill />`) is driven by the configured flags (not capture state), so it reads green whenever any redaction is queued for the next capture. Click → focuses the Exports panel.

### User-saved presets

In addition to the three built-in presets (`public`, `internal`, `none`) the Exports page's op-sec card lets the user save the current flag set as a named preset, stored in the `opsec_presets` table. The header `<select>` lists built-ins first, then user presets; `Save as…` opens an inline name input (overwrite is confirmed); `Delete` appears only when a user preset is the active selection. `presetFor()` in [src/state/opsecStore.ts](../../src/state/opsecStore.ts) checks user-preset flag-sets in addition to the built-ins, so toggling flags back to a saved configuration re-selects that preset instead of dropping to `Custom`.

## Filename pattern

`${planName}_${Panel}_${systemName?}_${YYYYMMDD-HHMMSS}.png` — built in [src/data/exportFilename.ts](../../src/data/exportFilename.ts), used by every PNG export.

## Critical files

- [core/db/schema.ts](../../core/db/schema.ts) — `export_log`, `export_config`.
- [core/handlers/exports.ts](../../core/handlers/exports.ts) — all `exports.*` handlers; legacy v1 validator.
- [core/data/dnaCodec.ts](../../core/data/dnaCodec.ts) — v2 family slot table, binary + text encoders/decoders, all v2 size limits.
- [src/types/index.ts](../../src/types/index.ts) — `EveSovApi` surface. The matching `contextBridge` entry lives in the desktop-wrapper repo's `electron/preload.ts` (see [Desktop-Wrapper-Repo-Setup.md](../Desktop-Wrapper-Repo-Setup.md)); its `ipc/index.ts` auto-bridges every registered core handler, so only the preload needs a per-channel line.
- [src/data/dokuwiki.ts](../../src/data/dokuwiki.ts) — pure DokuWiki page generator (markup helpers + one renderer per section).
- [src/panels/ExportsPage.tsx](../../src/panels/ExportsPage.tsx) — UI: PNG / Op-sec / DNA / DokuWiki / Moon / Log cards.
- [src/state/opsecStore.ts](../../src/state/opsecStore.ts) — flags, presets (`public`, `internal`, `custom`, `none`), capture toggle.
- [src/state/exportRegistry.ts](../../src/state/exportRegistry.ts) — per-panel export handlers register here on mount; the Exports page calls them for individual or bulk export.
- [src/components/OpsecPill.tsx](../../src/components/OpsecPill.tsx), [OpsecRoot.tsx](../../src/components/OpsecRoot.tsx).
- [src/data/opsecCapture.ts](../../src/data/opsecCapture.ts), [exportFilename.ts](../../src/data/exportFilename.ts).
- [src/panels/AssignmentMatrix.tsx](../../src/panels/AssignmentMatrix.tsx), [SitesOverview.tsx](../../src/panels/SitesOverview.tsx), [RegionMap.tsx](../../src/panels/RegionMap.tsx), [PlanInspector.tsx](../../src/panels/PlanInspector.tsx) — register their export with the registry, render `<OpsecPill />`, route filenames through the shared builder.

## Key decisions

- **Single-instance capture, not off-screen mount.** The plan originally proposed mounting target panels off-screen for capture. Re-mounting heavy panels (with their own data fetches) was costly; instead live panels are captured in place. Op-sec redactions briefly flash on-screen during capture — acceptable for a dedicated export tool.
- **Op-sec is store-driven, not prop-drilled.** Hooks (`useEffectiveOpsec`) read the same store, so toggling on the Exports page changes redaction for any export entry point — including the per-panel "Export PNG" buttons.
- **Bulk export = sequential single-export loop.** Each capture still goes through the user's save dialog; for bulk, callers should expect multiple dialogs. A directory-picker variant is left as a future improvement.
- **DNA upgrade names are strings, not integer IDs.** The `upgrades` table uses `name` as primary key; introducing a surrogate int would migrate every reference. The allow-list lookup against the local table provides the same guarantee at import time. v2 still produces upgrade-name strings post-decode — the family slot table is purely a wire-format optimisation.
- **v2 drops `installed` and `ordering`.** Per-upgrade install state and queue order weren't load-bearing in shared plans; encoding them re-inflated the payload without survival value. Imports re-derive both.
- **Capture pill ≠ capture state.** The pill reflects whether redaction *is configured*, not whether a capture is currently running.
- **The wiki export is a pure generator, not a DOM capture.** Every other export renders the live DOM (html2canvas / SVG serialisation) and therefore needs `withOpsecCapture` to commit redacted markup before capturing. A string generator has no DOM dependency, so it reads `useOpsec.getState().flags` directly and never sets `captureActive` — no on-screen redaction flash, no two-frame wait, and it works even when the Matrix / Sites panels aren't mounted. This is also why it does **not** register with `exportRegistry`.
- **Wiki clipboard doesn't log, wiki file save does.** Matches "Copy as Markdown" (no log) and `captureSvg` (logs), and avoids a second IPC channel that exists only to record a clipboard action.

## Open questions / next steps

- Add a SystemDetail PNG row (system picker + capture).
- Bulk export with a single directory chooser instead of N save dialogs.
- Extend text-substitution redactions: transfer-route source/destination labels, supercap upgrade column headers, gas/ice value substitution (currently CSS-hidden).
- DNA export from file picker, not just clipboard.
