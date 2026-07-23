import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { readD1Migrations } from '@cloudflare/vitest-pool-workers';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    cloudflareTest(async () => {
      const migrationsPath = path.join(dirname, 'migrations');
      const migrations = await readD1Migrations(migrationsPath);

      return {
        wrangler: {
          configPath: path.join(dirname, 'wrangler.test.jsonc'),
        },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
          },
        },
      };
    }),
  ],
  test: {
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
  },
});
