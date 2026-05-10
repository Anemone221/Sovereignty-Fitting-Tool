import { app, BrowserWindow, shell } from 'electron';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerIpc } from './ipc/index.js';
import { closeDb, getDb } from './db/userDb.js';
import { getMarketSyncStatus, runMarketSync } from './ipc/marketSync.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

function createMainWindow(): BrowserWindow {
  const icon = is.dev
    ? join(__dirname, '../../app.ico')
    : join(process.resourcesPath, 'app.ico');

  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    autoHideMenuBar: true,
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.on('ready-to-show', () => win.show());

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return win;
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.evesov.tool');

  let raisingSiblings = false;
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
    window.on('focus', () => {
      if (raisingSiblings) return;
      raisingSiblings = true;
      try {
        for (const other of BrowserWindow.getAllWindows()) {
          if (other === window || other.isDestroyed()) continue;
          if (other.isMinimized()) other.restore();
          other.showInactive();
        }
      } finally {
        raisingSiblings = false;
      }
    });
  });

  registerIpc();

  maybeStartupMarketSync();

  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

function maybeStartupMarketSync(): void {
  try {
    const db = getDb();
    const row = db
      .prepare('SELECT value FROM preferences WHERE key = ?')
      .get('settings.marketSync.onStartup') as { value: string } | undefined;
    if (row?.value !== 'true') return;
    const status = getMarketSyncStatus();
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    const stale =
      status.lastSyncAt == null ||
      Date.now() - new Date(status.lastSyncAt).getTime() > ONE_DAY_MS;
    if (!stale) return;
    void runMarketSync().catch((err) => {
      console.warn('[marketSync] startup sync failed:', err);
    });
  } catch (err) {
    console.warn('[marketSync] startup sync skipped:', err);
  }
}

app.on('window-all-closed', () => {
  closeDb();
  if (process.platform !== 'darwin') app.quit();
});
