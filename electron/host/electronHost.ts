import { BrowserWindow, dialog, net } from 'electron';
import { writeFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { PassThrough } from 'node:stream';
import unbzip2Stream from 'unbzip2-stream';
import type { Host, FetchMarketCsvResult } from '@core/host.js';

export const electronHost: Host = {
  broadcast(channel, payload) {
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed()) continue;
      win.webContents.send(channel, payload);
    }
  },

  async saveFile(req) {
    const parent = BrowserWindow.getFocusedWindow();
    const result = parent
      ? await dialog.showSaveDialog(parent, {
          title: req.title,
          defaultPath: req.defaultPath,
          filters: req.filters,
        })
      : await dialog.showSaveDialog({
          title: req.title,
          defaultPath: req.defaultPath,
          filters: req.filters,
        });
    if (result.canceled || !result.filePath) return { saved: false };
    let filePath = result.filePath;
    if (req.forceExtension) {
      const expected = '.' + req.forceExtension.replace(/^\./, '').toLowerCase();
      if (extname(filePath).toLowerCase() !== expected) {
        filePath = filePath + expected;
      }
    }
    const bytes =
      typeof req.bytes === 'string' ? Buffer.from(req.bytes, 'utf8') : Buffer.from(req.bytes);
    await writeFile(filePath, bytes);
    return { saved: true, path: filePath };
  },

  fetchMarketCsv(url): Promise<FetchMarketCsvResult> {
    return new Promise((resolve, reject) => {
      const req = net.request({ method: 'GET', url, redirect: 'follow' });
      req.on('response', (response) => {
        const status = response.statusCode;
        if (status !== 200) {
          // Drain the stream so the socket is released.
          response.on('data', () => {});
          response.on('end', () => resolve({ status }));
          response.on('error', () => resolve({ status }));
          return;
        }
        // Electron's IncomingMessage emits Buffer chunks but isn't a full
        // Readable; pipe via PassThrough so unbzip2-stream gets a real stream.
        const passthrough = new PassThrough();
        response.on('data', (chunk: Buffer) => passthrough.write(chunk));
        response.on('end', () => passthrough.end());
        response.on('error', (err) => passthrough.destroy(err));
        const decompressed = passthrough.pipe(unbzip2Stream());
        const chunks: Buffer[] = [];
        decompressed.on('data', (chunk: Buffer) => chunks.push(chunk));
        decompressed.on('end', () =>
          resolve({ status, text: Buffer.concat(chunks).toString('utf8') }),
        );
        decompressed.on('error', reject);
      });
      req.on('error', reject);
      req.end();
    });
  },
};
