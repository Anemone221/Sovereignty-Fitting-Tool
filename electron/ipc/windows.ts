import { BrowserWindow, ipcMain } from 'electron';
import { is } from '@electron-toolkit/utils';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

interface PopoutEntry {
  initialPanelId: string;
  panelIds: string[];
  title: string;
}

// windowId → entry for pop-out windows. Main window is *not* in this map.
const popouts = new Map<number, PopoutEntry>();

function getMainWindow(): BrowserWindow | undefined {
  return BrowserWindow.getAllWindows().find((w) => !popouts.has(w.id));
}

export function registerWindowsIpc(): void {
  ipcMain.handle('windows.openPanel', (_event, panelId: string) => {
    const win = new BrowserWindow({
      width: 900,
      height: 700,
      show: false,
      autoHideMenuBar: true,
      webPreferences: {
        preload: join(__dirname, '../preload/preload.mjs'),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    win.on('ready-to-show', () => win.show());
    win.on('closed', () => popouts.delete(win.id));

    const param = `panel=${encodeURIComponent(panelId)}`;

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      const base = process.env['ELECTRON_RENDERER_URL'];
      const sep = base.includes('?') ? '&' : '?';
      win.loadURL(`${base}${sep}${param}`);
    } else {
      win.loadFile(join(__dirname, '../renderer/index.html'), {
        query: { panel: panelId },
      });
    }

    popouts.set(win.id, { initialPanelId: panelId, panelIds: [panelId], title: panelId });
    return win.id;
  });

  ipcMain.handle('windows.dockBack', (event) => {
    const sender = BrowserWindow.fromWebContents(event.sender);
    if (sender && !sender.isDestroyed()) {
      popouts.delete(sender.id);
      sender.close();
    }
    getMainWindow()?.focus();
  });

  // Renderer reports its current dock contents so other windows can list it
  // in the "send to window" menu.
  ipcMain.handle(
    'windows.registerPanels',
    (event, panelIds: string[], title?: string) => {
      const sender = BrowserWindow.fromWebContents(event.sender);
      if (!sender) return;
      const existing = popouts.get(sender.id);
      if (existing) {
        existing.panelIds = [...panelIds];
        if (title) existing.title = title;
      }
    },
  );

  ipcMain.handle('windows.unregister', (event) => {
    const sender = BrowserWindow.fromWebContents(event.sender);
    if (!sender) return;
    popouts.delete(sender.id);
  });

  // Returns every window's id, title, panel ids, and main flag — for menus.
  ipcMain.handle('windows.self', (event) => {
    const sender = BrowserWindow.fromWebContents(event.sender);
    return sender ? sender.id : -1;
  });

  ipcMain.handle('windows.list', () => {
    const all = BrowserWindow.getAllWindows();
    return all.map((w) => {
      const entry = popouts.get(w.id);
      return {
        id: w.id,
        title: entry?.title ?? 'Main',
        panelIds: entry?.panelIds ?? [],
        isMain: !entry,
      };
    });
  });

  ipcMain.handle(
    'windows.sendPanelTo',
    (_event, targetWindowId: number, panelId: string) => {
      const target = BrowserWindow.fromId(targetWindowId);
      if (!target || target.isDestroyed()) return false;
      target.webContents.send('add-panel-requested', { panelId });
      target.focus();
      return true;
    },
  );

  // Broadcasts the selected system to every window so all zustand stores sync.
  // Distinct from selectAndFocusSystem (which also focuses the system panel).
  ipcMain.handle('windows.broadcastSelection', (_event, systemId: number) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('selected-system-changed', { systemId });
    }
  });

  // Called when the map double-clicks a system. Finds or opens the system panel
  // and broadcasts the selected system to all windows.
  ipcMain.handle('windows.selectAndFocusSystem', (_event, systemId: number) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('selected-system-changed', { systemId });
    }

    // Is the system panel already open in any pop-out?
    const popoutEntry = [...popouts.entries()].find(([, e]) =>
      e.panelIds.includes('system'),
    );
    if (popoutEntry) {
      const popoutWin = BrowserWindow.fromId(popoutEntry[0]);
      if (popoutWin && !popoutWin.isDestroyed()) {
        popoutWin.focus();
        return;
      }
    }

    // Otherwise tell the main window to focus/open the system panel.
    const main = getMainWindow();
    if (main) {
      main.focus();
      main.webContents.send('focus-panel-requested', { panelId: 'system' });
    }
  });
}
