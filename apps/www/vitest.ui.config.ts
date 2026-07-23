import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': path.join(dirname, 'src'),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.ui.test.{ts,tsx}'],
    name: 'www-ui',
    setupFiles: ['src/test-utils/setup-ui.ts'],
  },
});
