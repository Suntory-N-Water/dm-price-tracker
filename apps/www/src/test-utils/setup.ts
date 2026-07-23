import { env } from 'cloudflare:test';
import { applyD1Migrations } from 'cloudflare:test';
import type { D1Migration } from 'cloudflare:test';
import { beforeAll } from 'vitest';

declare global {
  namespace Cloudflare {
    // biome-ignore lint/style/useConsistentTypeDefinitions: Cloudflare VitestのEnvへテスト専用Bindingを宣言マージするため
    interface Env {
      DISPLAY_DB: D1Database;
      CARD_IMAGES: R2Bucket;
      SCREENSHOTS: R2Bucket;
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}

beforeAll(async () => {
  await applyD1Migrations(env.DISPLAY_DB, env.TEST_MIGRATIONS);
});
