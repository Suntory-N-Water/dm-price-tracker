import { applyD1Migrations, env } from 'cloudflare:test';
import type { D1Migration } from 'cloudflare:test';
import { beforeAll } from 'vitest';

type TestEnv = {
  DB: D1Database;
  TEST_MIGRATIONS: D1Migration[];
};

beforeAll(async () => {
  const testEnv = env as TestEnv;

  await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
});
