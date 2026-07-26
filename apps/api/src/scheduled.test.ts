import { env } from 'cloudflare:test';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  onTestFinished,
  vi,
} from 'vitest';
import { runScheduledCrawl } from './scheduled';
import { resetDisplayDb } from '#api/test-utils/display-db';

function createBindings(): CloudflareEnv {
  return {
    ...env,
    DISPLAY_DB: env.DISPLAY_DB,
    CARD_IMAGES: env.CARD_IMAGES,
    SCREENSHOTS: env.SCREENSHOTS,
    TEAM_DOMAIN: 'https://example.cloudflareaccess.com',
    POLICY_AUD: 'user-audience',
    ADMIN_POLICY_AUD: 'admin-audience',
    ADMIN_EMAIL: 'admin@example.com',
    CRAWLER_API_KEY: 'crawler-api-key',
    GITHUB_DISPATCH_TOKEN: 'github-token',
    GITHUB_REPOSITORY: 'Suntory-N-Water/dm-price-tracker',
  };
}

describe('定期クロール', () => {
  beforeEach(async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 204 })),
    );
    await resetDisplayDb();
    await env.DISPLAY_DB.batch([
      env.DISPLAY_DB.prepare(
        `INSERT INTO products (code, name)
         VALUES ('26ex2', 'カリスマBEST')`,
      ),
      env.DISPLAY_DB.prepare(
        `INSERT INTO cards (id, product_id, name, image_key)
         VALUES ('card-1', '26ex2', 'カードA', 'cards/card-1.png')`,
      ),
      env.DISPLAY_DB.prepare(
        `INSERT INTO price_series
          (id, card_id, normalized_additional_keyword)
         VALUES (1, 'card-1', '')`,
      ),
      env.DISPLAY_DB.prepare(
        `INSERT INTO search_conditions
          (id, price_series_id, normalized_exclude_keyword)
         VALUES (1, 1, '')`,
      ),
      env.DISPLAY_DB.prepare(
        `INSERT INTO users (email) VALUES ('user@example.com')`,
      ),
      env.DISPLAY_DB.prepare(
        `INSERT INTO card_watches
          (user_email, card_id, search_condition_id, is_current)
         VALUES ('user@example.com', 'card-1', 1, 1)`,
      ),
    ]);
    onTestFinished(resetDisplayDb);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('期限切れの実行がある時、失敗へ変更して新しい定期実行を開始すること', async () => {
    const sut = runScheduledCrawl;
    await env.DISPLAY_DB.prepare(
      `INSERT INTO crawl_runs (id, kind, status, expires_at)
       VALUES ('expired-run', 'MERCARI', 'RUNNING', '2000-01-01 00:00:00')`,
    ).run();

    await sut(createBindings());

    const runs = await env.DISPLAY_DB.prepare(
      `SELECT id, status
       FROM crawl_runs
       WHERE kind = 'MERCARI'
       ORDER BY created_at, id`,
    ).all();
    expect(runs.results).toHaveLength(2);
    expect(runs.results).toContainEqual({
      id: 'expired-run',
      status: 'FAILED',
    });
    expect(runs.results).toContainEqual(
      expect.objectContaining({ status: 'RUNNING' }),
    );
  });

  it('有効な実行がある時、新しい定期実行を作成しないこと', async () => {
    const sut = runScheduledCrawl;
    await env.DISPLAY_DB.prepare(
      `INSERT INTO crawl_runs (id, kind, status, expires_at)
       VALUES ('running-run', 'MERCARI', 'RUNNING', '2999-01-01 00:00:00')`,
    ).run();

    await sut(createBindings());

    const count = await env.DISPLAY_DB.prepare(
      `SELECT COUNT(*) AS count
       FROM crawl_runs
       WHERE kind = 'MERCARI'`,
    ).first<{ count: number }>();
    expect(count?.count).toBe(1);
    expect(fetch).not.toHaveBeenCalled();
  });
});
