import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: resolve(__dirname, 'electron/main.ts')
      }
    },
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/types'),
        '@core': resolve(__dirname, 'core')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: resolve(__dirname, 'electron/preload.ts')
      }
    },
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/types'),
        '@core': resolve(__dirname, 'core')
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src'),
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/index.html')
        }
      }
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        '@shared': resolve(__dirname, 'src/types'),
        '@core': resolve(__dirname, 'core')
      }
    },
    plugins: [react()]
  }
});
