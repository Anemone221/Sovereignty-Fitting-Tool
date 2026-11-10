import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

// Separate from vite.config.ts, whose `root` is src/ (the renderer). Tests for
// the portable core live next to the code under core/.
export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/types'),
      '@core': resolve(__dirname, 'core'),
    },
  },
  test: {
    include: ['core/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
  },
});
