# Windows (multi-window dock)

## Purpose

The app supports multiple top-level Electron `BrowserWindow`s. Every window — main and pop-out — mounts a full Dockview instance with its own `ActivityBar`, so users can compose any layout in any window. Panels can be sent between windows via a tab kebab menu, and selection state (currently `selectedSystemId`) is broadcast across windows so panels in different windows stay in sync.

## Schema

None. State is process-local (zustand) plus the existing `preferences` rows for the **main** window's dock layout (`dock.layout.v1`, `dock.active.v1`). Secondary windows are session-only.

## IPC

All under `windows.*` in `electron/ipc/windows.ts`:

- `windows.openPanel(panelId)` — create a new BrowserWindow seeded with `panelId`.
- `windows.dockBack()` — close the sender window; focus main.
- `windows.self()` — return sender's `BrowserWindow.id`.
- `windows.registerPanels(panelIds, title?)` — sender reports its current dock contents to the registry.
- `windows.unregister()` — sender removes itself from the registry.
- `windows.list()` — `[{ id, title, panelIds, isMain }]` of every live window, for the send-to menu.
- `windows.sendPanelTo(targetId, panelId)` — main process sends `add-panel-requested` event to the target window. Sender is responsible for closing the panel locally.
- `windows.broadcastSelection(systemId)` — broadcasts `selected-system-changed` to **all** windows (no focus, no panel open).
- `windows.selectAndFocusSystem(systemId)` — same broadcast plus focuses/opens the System panel; used by the region-map double-click.

Renderer events:
- `selected-system-changed` — every window listens; updates local `useUi.selectedSystemId` via `setSelectedSystemLocal` to avoid re-broadcast loops.
- `add-panel-requested` — every window listens; calls its dock's `addOrFocus(panelId)`.
- `focus-panel-requested` — main window only; opens/focuses a panel from external triggers.

## Critical files

- `electron/ipc/windows.ts` — registry + IPC handlers.
- `src/main.tsx` — routes URL `?panel=...` windows to `SecondaryDockShell`.
- `src/shell/DockShell.tsx` — main window dock; persists layout.
- `src/shell/SecondaryDockShell.tsx` — pop-out dock; session-only, seeds with the URL panel id.
- `src/shell/dockComponents.tsx` — shared `components` and `PANELS` registry; `addOrFocusPanel`.
- `src/shell/PanelTab.tsx` — Dockview default-tab override with kebab popover for send-to-window.
- `src/state/uiStore.ts` — `selectSystem` broadcasts; `setSelectedSystemLocal` is the no-broadcast setter for IPC listeners.

## Key decisions

- **Pop-out chain** over cross-window drag-and-drop: each window can pop out further, and explicit "send to" moves are routed through the main process. Cross-window drag is not supported by Dockview without a custom protocol.
- **Session-only secondary windows**: closing the app does not restore them. The main window's layout is the only persisted dock state.
- **Two distinct add-panel events**: `focus-panel-requested` (main-window only, used by the map's "open the system panel" flow) is intentionally separate from `add-panel-requested` (per-target window, used by send-to-window) so the two flows can evolve independently.
- **No-broadcast setter** (`setSelectedSystemLocal`) is used by IPC listeners to prevent feedback loops — the broadcasting setter `selectSystem` is for user actions only.

## Open questions / next steps

- No tests for the multi-window registry — manual verification only.
- Cross-window panel drag-and-drop would require a serialization protocol; deliberately deferred.
- Layout/position persistence for secondary windows: deferred per design.
