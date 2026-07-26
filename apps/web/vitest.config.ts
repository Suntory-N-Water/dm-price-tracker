import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  define: {
    'import.meta.env.VITE_API_BASE_URL': JSON.stringify('http://api.test'),
  },
  resolve: {
    alias: {
      '@': path.join(dirname, 'src'),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.ui.test.{ts,tsx}'],
    name: 'web',
    setupFiles: ['src/test-utils/setup-ui.ts'],
  },
});
