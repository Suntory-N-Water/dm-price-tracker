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
import { createApp } from './app';
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

describe('管理API', () => {
  beforeEach(async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 204 })),
    );
    await resetDisplayDb();
    await env.DISPLAY_DB.prepare(
      `INSERT INTO products (code, name, display_order)
       VALUES
         ('26ex2', 'カリスマBEST', 0),
         ('26rp2', 'ドギラゴン逆の段', 1),
         ('25ex4', 'パンドラ・ウォーズ', 2)`,
    ).run();
    onTestFinished(resetDisplayDb);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('管理商品一覧の時、各クロールと未完了カードの最新状態を取得できること', async () => {
    const sut = createApp({
      verifyAccessToken: async () => 'admin@example.com',
    });
    const bindings = createBindings();
    await env.DISPLAY_DB.batch([
      env.DISPLAY_DB.prepare(
        `INSERT INTO crawl_runs
          (id, kind, product_code, status, expires_at, created_at, updated_at)
         VALUES
          ('card-ids-1', 'OFFICIAL_CARD_IDS', '26ex2', 'COMPLETED',
           '2026-07-23 13:00:00', '2026-07-23 12:00:00', '2026-07-23 12:10:00'),
          ('card-details-1', 'OFFICIAL_CARD_DETAILS', '26ex2', 'PARTIALLY_FAILED',
           '2026-07-23 14:00:00', '2026-07-23 12:20:00', '2026-07-23 12:30:00'),
          ('mercari-1', 'MERCARI', NULL, 'FAILED',
           '2026-07-23 13:00:00', '2026-07-23 12:00:00', '2026-07-23 12:05:00')`,
      ),
      env.DISPLAY_DB.prepare(
        `INSERT INTO crawl_targets
          (crawl_run_id, target_id, status, error, updated_at)
         VALUES
          ('card-ids-1', '26ex2', 'SUCCEEDED', NULL, '2026-07-23 12:10:00'),
          ('card-details-1', 'card-1', 'FAILED', '詳細の取得に失敗', '2026-07-23 12:30:00'),
          ('mercari-1', '1', 'FAILED', '価格の取得に失敗', '2026-07-23 12:05:00')`,
      ),
      env.DISPLAY_DB.prepare(
        `INSERT INTO pending_cards (id, product_id)
         VALUES ('card-1', '26ex2'), ('card-2', '26ex2')`,
      ),
    ]);

    const response = await sut.request(
      '/api/admin/products',
      {
        headers: {
          origin: 'http://web.test',
          'cf-access-jwt-assertion': 'valid-token',
        },
      },
      bindings,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      products: [
        {
          code: '26ex2',
          name: 'カリスマBEST',
          cardIdCrawl: {
            status: 'COMPLETED',
            updatedAt: '2026-07-23 12:10:00',
            error: null,
          },
          cardDetailsCrawl: {
            status: 'PARTIALLY_FAILED',
            updatedAt: '2026-07-23 12:30:00',
            error: '詳細の取得に失敗',
          },
          pendingCardCount: 2,
        },
      ],
      mercariCrawl: {
        status: 'FAILED',
        updatedAt: '2026-07-23 12:05:00',
        error: '価格の取得に失敗',
      },
      officialProductsCrawl: null,
    });
  });

  it('未開始商品を検索した時、カードID収集を開始済みの商品を除外すること', async () => {
    const sut = createApp({
      verifyAccessToken: async () => 'admin@example.com',
    });
    await env.DISPLAY_DB.prepare(
      `INSERT INTO crawl_runs
        (id, kind, product_code, status, expires_at)
       VALUES ('card-ids-1', 'OFFICIAL_CARD_IDS', '26ex2', 'COMPLETED',
               '2026-07-23 13:00:00')`,
    ).run();

    const response = await sut.request(
      '/api/admin/products/available?name=%E9%80%86%E3%81%AE%E6%AE%B5',
      {
        headers: {
          origin: 'http://web.test',
          'cf-access-jwt-assertion': 'valid-token',
        },
      },
      createBindings(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      products: [{ code: '26rp2', name: 'ドギラゴン逆の段' }],
    });
  });

  it('開始済み商品が分割単位を超える時、未開始商品だけを返すこと', async () => {
    const sut = createApp({
      verifyAccessToken: async () => 'admin@example.com',
    });
    const startedProductCodes = Array.from(
      { length: 120 },
      (_, index) => `started-${index}`,
    );
    await env.DISPLAY_DB.batch([
      env.DISPLAY_DB.prepare(
        `INSERT INTO products (code, name, display_order)
         SELECT value, '開始済み商品', 10 FROM json_each(?)`,
      ).bind(JSON.stringify(startedProductCodes)),
      env.DISPLAY_DB.prepare(
        `INSERT INTO crawl_runs (id, kind, product_code, status, expires_at)
         SELECT value, 'OFFICIAL_CARD_IDS', value, 'COMPLETED',
                '2026-07-23 13:00:00'
         FROM json_each(?)`,
      ).bind(JSON.stringify(startedProductCodes)),
    ]);

    const response = await sut.request(
      '/api/admin/products/available',
      {
        headers: {
          origin: 'http://web.test',
          'cf-access-jwt-assertion': 'valid-token',
        },
      },
      createBindings(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      products: [
        { code: '26ex2', name: 'カリスマBEST' },
        { code: '26rp2', name: 'ドギラゴン逆の段' },
        { code: '25ex4', name: 'パンドラ・ウォーズ' },
      ],
    });
  });

  it('商品一覧を更新した時、新しい実行と固定対象を作成すること', async () => {
    const sut = createApp({
      verifyAccessToken: async () => 'admin@example.com',
    });

    const response = await sut.request(
      '/api/admin/products/sync',
      {
        method: 'POST',
        headers: {
          origin: 'http://web.test',
          'cf-access-jwt-assertion': 'valid-token',
        },
      },
      createBindings(),
    );
    const body = await response.json<{ id: string; status: string }>();
    const target = await env.DISPLAY_DB.prepare(
      `SELECT crawl_runs.kind, crawl_targets.target_id
       FROM crawl_runs
       INNER JOIN crawl_targets ON crawl_targets.crawl_run_id = crawl_runs.id
       WHERE crawl_runs.id = ?`,
    )
      .bind(body.id)
      .first();

    expect(response.status).toBe(202);
    expect(body.status).toBe('RUNNING');
    expect(target).toEqual({
      kind: 'OFFICIAL_PRODUCTS',
      target_id: 'products',
    });
  });

  it('同じ商品のカードID収集が実行中の時、二重開始を拒否すること', async () => {
    const sut = createApp({
      verifyAccessToken: async () => 'admin@example.com',
    });
    await env.DISPLAY_DB.prepare(
      `INSERT INTO crawl_runs
        (id, kind, product_code, status, expires_at)
       VALUES ('card-ids-1', 'OFFICIAL_CARD_IDS', '26ex2', 'RUNNING',
               '2026-07-23 13:00:00')`,
    ).run();

    const response = await sut.request(
      '/api/admin/products/26ex2/crawl',
      {
        method: 'POST',
        headers: {
          origin: 'http://web.test',
          'cf-access-jwt-assertion': 'valid-token',
        },
      },
      createBindings(),
    );

    expect(response.status).toBe(409);
  });

  it('カード詳細を再取得した時、直前に失敗した対象だけを引き継ぐこと', async () => {
    const sut = createApp({
      verifyAccessToken: async () => 'admin@example.com',
    });
    await env.DISPLAY_DB.batch([
      env.DISPLAY_DB.prepare(
        `INSERT INTO pending_cards (id, product_id)
         VALUES ('card-1', '26ex2'), ('card-3', '26ex2')`,
      ),
      env.DISPLAY_DB.prepare(
        `INSERT INTO crawl_runs
          (id, kind, product_code, status, expires_at)
         VALUES ('card-details-1', 'OFFICIAL_CARD_DETAILS', '26ex2',
                 'PARTIALLY_FAILED', '2026-07-23 13:00:00')`,
      ),
      env.DISPLAY_DB.prepare(
        `INSERT INTO crawl_targets
          (crawl_run_id, target_id, status, error)
         VALUES
          ('card-details-1', 'card-1', 'FAILED', '取得失敗'),
          ('card-details-1', 'card-2', 'SUCCEEDED', NULL)`,
      ),
    ]);

    const response = await sut.request(
      '/api/admin/products/26ex2/card-details',
      {
        method: 'POST',
        headers: {
          origin: 'http://web.test',
          'cf-access-jwt-assertion': 'valid-token',
        },
      },
      createBindings(),
    );
    const body = await response.json<{ id: string }>();
    const run = await env.DISPLAY_DB.prepare(
      `SELECT retried_from_run_id
       FROM crawl_runs
       WHERE id = ?`,
    )
      .bind(body.id)
      .first();
    const targets = await env.DISPLAY_DB.prepare(
      `SELECT target_id
       FROM crawl_targets
       WHERE crawl_run_id = ?
       ORDER BY target_id`,
    )
      .bind(body.id)
      .all();

    expect(response.status).toBe(202);
    expect(run).toEqual({ retried_from_run_id: 'card-details-1' });
    expect(targets.results).toEqual([{ target_id: 'card-1' }]);
  });

  it('クロール対象が分割単位を超える時、対象をすべて登録すること', async () => {
    const sut = createApp({
      verifyAccessToken: async () => 'admin@example.com',
    });
    const pendingCardIds = Array.from(
      { length: 250 },
      (_, index) => `bulk-${index}`,
    );
    await env.DISPLAY_DB.prepare(
      `INSERT INTO pending_cards (id, product_id)
       SELECT value, '26ex2' FROM json_each(?)`,
    )
      .bind(JSON.stringify(pendingCardIds))
      .run();

    const response = await sut.request(
      '/api/admin/products/26ex2/card-details',
      {
        method: 'POST',
        headers: {
          origin: 'http://web.test',
          'cf-access-jwt-assertion': 'valid-token',
        },
      },
      createBindings(),
    );
    const body = await response.json<{ id: string }>();
    const targets = await env.DISPLAY_DB.prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) AS pending
       FROM crawl_targets
       WHERE crawl_run_id = ?`,
    )
      .bind(body.id)
      .first();

    expect(response.status).toBe(202);
    expect(targets).toEqual({ total: 250, pending: 250 });
  });

  it('管理者以外の時、管理APIを利用できないこと', async () => {
    const sut = createApp({
      verifyAccessToken: async () => 'friend@example.com',
    });

    const response = await sut.request(
      '/api/admin/products',
      {
        headers: {
          origin: 'http://web.test',
          'cf-access-jwt-assertion': 'valid-token',
        },
      },
      createBindings(),
    );

    expect(response.status).toBe(403);
  });
});
