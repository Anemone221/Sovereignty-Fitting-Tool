# Setting up the desktop-wrapper repo

This is the Phase 4 operational checklist from [Repository-Split-Proposal.md](Repository-Split-Proposal.md).

After Phases 0–3 land in this (the application) repo, the desktop app still works
end-to-end via the existing `electron/` directory. To finish the split, the
Electron-only shell moves into a **new repository** that consumes this repo as a
git submodule.

This guide is for the human running the split — the AI cannot create remote
repositories.

---

## Prerequisites

Before starting, this repo must be in the Phase 3 end-state:

- `core/` exists and contains the portable backend (`core/db/`, `core/handlers/`,
  `core/sde/`, `core/market/`, `core/csv/`, `core/data/`, `core/host.ts`,
  `core/registerCore.ts`, `core/index.ts`).
- `electron/` still exists, containing only the desktop shell: `main.ts`,
  `preload.ts`, `host/electronHost.ts`, `db/connection.ts`, `db/userDb.ts`,
  `db/seed.ts`, `seed-entry.cjs`, `sde/legendIcons.ts`, `ipc/index.ts`,
  `ipc/windows.ts`, `ipc/unbzip2-stream.d.ts`.
- `npm run typecheck`, `npx electron-vite build`, and `npm run build:web` all
  pass.
- `npm run dev` launches the desktop app and every feature still works.
- The current branch is committed and pushed to the application repo.

---

## 1. Create the new repository

1. Pick a name (working title: `eveSovTool-desktop`).
2. Create the empty repo on GitHub (private or public; matches the application
   repo's visibility).
3. Clone it locally **as a sibling** of this repo:

   ```bash
   cd <parent-directory-of-eveSovTool>
   git clone git@github.com:<owner>/eveSovTool-desktop.git
   cd eveSovTool-desktop
   ```

---

## 2. Add the application repo as a submodule

```bash
git submodule add git@github.com:Anemone221/Sovereignty-Fitting-Tool.git react
git submodule update --init --recursive
```

This creates `react/` containing this repo's source. Pin to the commit that
contains Phases 0–3:

```bash
cd react
git checkout <commit-sha-with-phases-0-3>
cd ..
git add react .gitmodules
git commit -m "Add application repo as submodule"
```

The desktop-wrapper repo's `electron-vite` build will read its renderer source
from `react/src/` and its portable backend from `react/core/`.

---

## 3. Move files from the application repo into the wrapper repo

From the application repo (this one), copy these into the new
desktop-wrapper repo (preserving directory structure):

| Source (application repo) | Destination (wrapper repo) |
| --- | --- |
| `electron/main.ts` | `electron/main.ts` |
| `electron/preload.ts` | `electron/preload.ts` |
| `electron/host/electronHost.ts` | `electron/host/electronHost.ts` |
| `electron/db/connection.ts` | `electron/db/connection.ts` |
| `electron/db/userDb.ts` | `electron/db/userDb.ts` |
| `electron/db/seed.ts` | `electron/db/seed.ts` |
| `electron/seed-entry.cjs` | `electron/seed-entry.cjs` |
| `electron/sde/legendIcons.ts` | `electron/sde/legendIcons.ts` |
| `electron/ipc/index.ts` | `electron/ipc/index.ts` |
| `electron/ipc/windows.ts` | `electron/ipc/windows.ts` |
| `electron/ipc/unbzip2-stream.d.ts` | `electron/ipc/unbzip2-stream.d.ts` |
| `electron.vite.config.ts` | `electron.vite.config.ts` |
| `electron-builder.yml` | `electron-builder.yml` |
| `electron-builder.unsigned.yml` | `electron-builder.unsigned.yml` |
| `tsconfig.node.json` | `tsconfig.node.json` |
| `tsconfig.json` | `tsconfig.json` |
| `app.ico`, `app.icns`, `app.png` | (root) |
| `outside_Resources/` (entire dir) | `outside_Resources/` |
| `LICENSE` (GPL-3.0 — copy verbatim) | `LICENSE` |
| `.github/workflows/build_beta.yml` (if present) | `.github/workflows/build_beta.yml` |
| `docs/install/macos/` (if present) | `docs/install/macos/` |

Then **delete those files from this repo** as part of the cutover (see step 6
below). Don't delete them yet — the wrapper has to be working first.

---

## 4. Adjust paths and configs in the wrapper repo

### 4.1 `electron.vite.config.ts`

Point the renderer build at the submodule and add the `@core` alias in every
block:

```ts
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

const REACT = resolve(__dirname, 'react');

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { lib: { entry: resolve(__dirname, 'electron/main.ts') } },
    resolve: {
      alias: {
        '@shared': resolve(REACT, 'src/types'),
        '@core': resolve(REACT, 'core'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { lib: { entry: resolve(__dirname, 'electron/preload.ts') } },
    resolve: {
      alias: {
        '@shared': resolve(REACT, 'src/types'),
        '@core': resolve(REACT, 'core'),
      },
    },
  },
  renderer: {
    root: resolve(REACT, 'src'),
    build: {
      rollupOptions: { input: { index: resolve(REACT, 'src/index.html') } },
    },
    resolve: {
      alias: {
        '@': resolve(REACT, 'src'),
        '@shared': resolve(REACT, 'src/types'),
        '@core': resolve(REACT, 'core'),
      },
    },
    plugins: [react()],
  },
});
```

### 4.2 `tsconfig.node.json`

Update `include` and `paths` to point at the submodule:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "allowSyntheticDefaultImports": true,
    "types": ["node"],
    "composite": true,
    "baseUrl": ".",
    "paths": {
      "@shared/*": ["react/src/types/*"],
      "@core/*": ["react/core/*"]
    }
  },
  "include": [
    "electron/**/*.ts",
    "electron.vite.config.ts",
    "react/src/types/**/*.ts",
    "react/core/**/*.ts"
  ]
}
```

### 4.3 `tsconfig.json`

Drop the web reference (this repo is desktop-only):

```json
{
  "files": [],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

### 4.4 `electron-builder.yml`

Pre-existing `out/**/*` and `resources/seed.db` config still works — the build
outputs land in the wrapper repo's `out/` and `resources/`.

---

## 5. Wrapper repo `package.json`

```json
{
  "name": "evesov-tool-desktop",
  "version": "0.0.1",
  "description": "Desktop wrapper for the EVE Sov Tool (Electron shell + native SQLite + installer).",
  "main": "out/main/main.js",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "start": "electron-vite preview",
    "seed": "electron electron/seed-entry.cjs",
    "typecheck": "tsc --noEmit -p tsconfig.node.json",
    "rebuild": "node node_modules/@electron/rebuild/lib/cli.js -f -w better-sqlite3",
    "postinstall": "node node_modules/@electron/rebuild/lib/cli.js -f -w better-sqlite3",
    "package": "electron-vite build && electron-builder --win",
    "package:dir": "electron-vite build && electron-builder --win --dir --config electron-builder.unsigned.yml",
    "package:unsigned": "electron-vite build && electron-builder --win --config electron-builder.unsigned.yml",
    "package:mac": "electron-vite build && electron-builder --mac",
    "package:mac:unsigned": "electron-vite build && electron-builder --mac --config electron-builder.unsigned.yml",
    "package:linux": "electron-vite build && electron-builder --linux",
    "package:linux:unsigned": "electron-vite build && electron-builder --linux --config electron-builder.unsigned.yml"
  },
  "dependencies": {
    "@electron-toolkit/preload": "^3.0.1",
    "@electron-toolkit/utils": "^4.0.0",
    "better-sqlite3": "^12.4.0",
    "unbzip2-stream": "^1.4.3"
  },
  "devDependencies": {
    "@electron/packager": "^20.0.0",
    "@electron/rebuild": "^4.0.4",
    "@types/better-sqlite3": "^7.6.13",
    "@types/node": "^22.13.0",
    "@vitejs/plugin-react": "^4.3.4",
    "electron": "^41.4.0",
    "electron-builder": "^26.8.1",
    "electron-vite": "^3.0.0",
    "typescript": "^5.9.3",
    "vite": "^6.0.7"
  }
}
```

Renderer/core runtime deps (`react`, `dockview-react`, `papaparse`, `zustand`,
`html2canvas`, `@tanstack/react-table`) are resolved from the **submodule's**
`node_modules` — see step 6.

---

## 6. Build sequence

```bash
cd eveSovTool-desktop
npm ci
(cd react && npm ci)        # install React + core deps inside the submodule
npm run rebuild             # rebuild better-sqlite3 against pinned Electron
npm run seed                # produce resources/seed.db
npm run typecheck
npm run build               # main + preload + renderer (using submodule)
npm run dev                 # launch the desktop app
npm run package:dir         # produce an unpacked installer for smoke-testing
```

If any step fails, fix in the wrapper repo (or in the submodule on its own
branch, then re-pin) and retry — do **not** start step 7 until `npm run dev`
behaves identically to the pre-split desktop app.

---

## 7. Cutover in the application repo

Once the wrapper repo builds, runs, and passes a feature click-test
end-to-end, delete the now-duplicated files from this (application) repo:

```bash
# Application repo, in a new branch
git rm -r electron/
git rm electron.vite.config.ts
git rm electron-builder.yml electron-builder.unsigned.yml
git rm tsconfig.node.json
git rm app.ico app.icns app.png       # if any are in the repo root
git rm -r outside_Resources           # moved to wrapper repo
git rm -r .github/workflows/build_beta.yml   # moved to wrapper repo
git rm -r docs/install/macos          # if present, moved to wrapper repo
```

Trim `package.json` to web-only deps and scripts:

```json
{
  "name": "eve-sov-tool",
  "version": "0.0.1",
  "description": "Sov Fitting Tool (SFT) — EVE Online sovereignty upgrade planning tool",
  "private": true,
  "type": "module",
  "scripts": {
    "dev:web": "vite",
    "build:web": "vite build",
    "preview:web": "vite preview",
    "typecheck:web": "tsc --noEmit -p tsconfig.web.json",
    "typecheck:core": "tsc --noEmit -p tsconfig.core.json",
    "typecheck": "npm run typecheck:web && npm run typecheck:core"
  },
  "dependencies": {
    "@tanstack/react-table": "^8.21.3",
    "dockview-react": "^4.5.1",
    "html2canvas": "^1.4.1",
    "papaparse": "^5.5.3",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "zustand": "^5.0.6"
  },
  "devDependencies": {
    "@eslint/js": "^10.0.1",
    "@types/node": "^22.13.0",
    "@types/papaparse": "^5.3.16",
    "@types/react": "^18.3.18",
    "@types/react-dom": "^18.3.5",
    "@vitejs/plugin-react": "^4.3.4",
    "eslint": "^10.2.1",
    "typescript": "^5.9.3",
    "typescript-eslint": "^8.59.1",
    "vite": "^6.0.7"
  }
}
```

Update `tsconfig.json` to drop the node reference:

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.web.json" },
    { "path": "./tsconfig.core.json" }
  ]
}
```

Update `tsconfig.web.json` `include` to add `core/**/*.ts` if you want the
renderer typecheck to also see core types (optional — renderer never imports
core at runtime, only via the `EveSovApi` contract in `@shared`).

Finally:

```bash
npm install
npm run typecheck
npm run build:web
npm run preview:web      # smoke-test the standalone shell + stub backend
```

Commit and push.

---

## 8. Update CI

- **Wrapper repo:** copy `.github/workflows/build_beta.yml` and add
  `git submodule update --init --recursive` before any `npm ci`.
- **Application repo:** add a new minimal workflow that runs
  `npm run typecheck` and `npm run build:web`. Optionally add a grep gate
  asserting that nothing under `core/` runtime-imports `electron` or
  `better-sqlite3`.

---

## 9. Documentation cleanup

Once both repos are working:

- Move `docs/install/macos/` to the wrapper repo (already done in step 3).
- Update [docs/features/Data-Sync-System.md](features/Data-Sync-System.md) to
  reflect that the seed pipeline now lives in the wrapper repo, and the
  importers it calls live in `core/`.
- Add a one-line pointer to the wrapper repo at the top of this repo's README.
- This file (`docs/Desktop-Wrapper-Repo-Setup.md`) can be archived or moved to
  the wrapper repo once the split is complete.

---

## Verification checklist

- [ ] Wrapper repo `npm run dev` launches the desktop app
- [ ] Plans CRUD works end-to-end (create, rename, duplicate, delete)
- [ ] PNG/SVG export saves files (saveFile seam)
- [ ] Market sync runs successfully (fetchMarketCsv seam)
- [ ] Moon scan import + profitability shows results
- [ ] Multi-window tear-out works
- [ ] Wrapper repo `npm run package:dir` produces a working install
- [ ] Application repo `npm run build:web` produces `dist-web/`
- [ ] Application repo `npm run preview:web` loads the shell — visible blank
      shell with one or more `BackendUnavailableError` console messages
- [ ] Both repos pass `npm run typecheck`
