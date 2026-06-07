import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

/**
 * Standalone web build for the renderer. The renderer is fully decoupled from
 * Electron: its only backend touchpoint is `src/api/evesov.ts → selectBackend()`,
 * which returns a stub when no host injects `window.evesov`. Use the Electron
 * desktop wrapper (see electron.vite.config.ts) for the desktop build.
 */
export default defineConfig({
  root: resolve(__dirname, 'src'),
  build: {
    outDir: resolve(__dirname, 'dist-web'),
    emptyOutDir: true,
    rollupOptions: {
      input: { index: resolve(__dirname, 'src/index.html') },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@shared': resolve(__dirname, 'src/types'),
    },
  },
  plugins: [react()],
});
