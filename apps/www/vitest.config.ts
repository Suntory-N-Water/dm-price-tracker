import {
  cloudflareTest,
  readD1Migrations,
} from '@cloudflare/vitest-pool-workers';
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
  plugins: [
    cloudflareTest(async () => ({
      wrangler: {
        configPath: path.join(dirname, 'wrangler.test.jsonc'),
      },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations(
            path.join(dirname, '../mercari-crawler/migrations-display-db'),
          ),
        },
      },
    })),
  ],
  test: {
    clearMocks: true,
    restoreMocks: true,
    setupFiles: ['src/test-utils/setup.ts'],
  },
});
