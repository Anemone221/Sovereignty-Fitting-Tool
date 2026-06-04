import { ipcMain } from 'electron';
import { listHandlers } from '@core/registerCore.js';
import { registerPrefsHandlers } from '@core/handlers/prefs.js';
import { registerDataHandlers } from '@core/handlers/data.js';
import { registerMapHandlers } from '@core/handlers/map.js';
import { registerStructuresHandlers } from '@core/handlers/structures.js';
import { registerMoonScansHandlers } from '@core/handlers/moonScans.js';
import { registerMarketSyncHandlers } from '@core/handlers/marketSync.js';
import { registerExportsHandlers } from '@core/handlers/exports.js';
import { registerPlansHandlers } from '@core/handlers/plans.js';
import { registerWindowsIpc } from './windows.js';

export function registerIpc(): void {
  ipcMain.handle('ping', () => 'pong');

  // Register all core handlers — each register() call adds to the central registry.
  registerPrefsHandlers();
  registerDataHandlers();
  registerMapHandlers();
  registerStructuresHandlers();
  registerMoonScansHandlers();
  registerMarketSyncHandlers();
  registerExportsHandlers();
  registerPlansHandlers();

  // Bridge every registered core handler to ipcMain.
  for (const [channel, fn] of listHandlers()) {
    ipcMain.handle(channel, (_e, ...args) => fn(...args));
  }

  // Electron-only shell IPC (windows / multi-window — stays in the desktop wrapper).
  registerWindowsIpc();
}
