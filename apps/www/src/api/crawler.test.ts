import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it, onTestFinished } from 'vitest';
import { createApp } from './app';
import { resetDisplayDb } from '@/test-utils/display-db';

const crawlRunId = '11111111-1111-4111-8111-111111111111';

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

async function crawlerRequest(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', 'Bearer crawler-api-key');
  if (init.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }
  return await createApp().request(
    `/api/crawler${path}`,
    { ...init, headers },
    createBindings(),
  );
}

describe('クローラー専用API', () => {
  beforeEach(async () => {
    await resetDisplayDb();
    await env.DISPLAY_DB.batch([
      env.DISPLAY_DB.prepare(
        `INSERT INTO products (code, name, display_order)
         VALUES ('26ex2', 'カリスマBEST', 0)`,
      ),
      env.DISPLAY_DB.prepare(
        `INSERT INTO cards (id, product_id, name, image_key)
         VALUES ('card-1', '26ex2', 'カードA', 'cards/card-1.png')`,
      ),
      env.DISPLAY_DB.prepare(
        `INSERT INTO price_series
          (id, card_id, normalized_additional_keyword)
         VALUES (1, 'card-1', '4枚')`,
      ),
      env.DISPLAY_DB.prepare(
        `INSERT INTO search_conditions
          (id, price_series_id, normalized_exclude_keyword)
         VALUES (1, 1, '除外')`,
      ),
    ]);
    onTestFinished(resetDisplayDb);
  });

  it('Bearer認証がない時、利用を拒否すること', async () => {
    const sut = createApp();

    const response = await sut.request(
      `/api/crawler/runs/${crawlRunId}`,
      {},
      createBindings(),
    );

    expect(response.status).toBe(401);
  });

  it('メルカリ実行を取得した時、成功済み以外の検索条件だけを返すこと', async () => {
    await env.DISPLAY_DB.batch([
      env.DISPLAY_DB.prepare(
        `INSERT INTO crawl_runs (id, kind, status, expires_at)
         VALUES (?, 'MERCARI', 'RUNNING', '2026-07-23 13:00:00')`,
      ).bind(crawlRunId),
      env.DISPLAY_DB.prepare(
        `INSERT INTO crawl_targets (crawl_run_id, target_id, status)
         VALUES (?, '1', 'PENDING')`,
      ).bind(crawlRunId),
    ]);

    const response = await crawlerRequest(`/runs/${crawlRunId}`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      kind: 'MERCARI',
      targets: [
        {
          searchConditionId: '1',
          cardName: 'カードA',
          additionalKeyword: '4枚',
          excludeKeyword: '除外',
        },
      ],
    });
  });

  it('メルカリ結果を保存した時、1MB上限内の一覧を集計して状態を完了すること', async () => {
    await env.DISPLAY_DB.batch([
      env.DISPLAY_DB.prepare(
        `INSERT INTO crawl_runs (id, kind, status, expires_at)
         VALUES (?, 'MERCARI', 'RUNNING', '2026-07-23 13:00:00')`,
      ).bind(crawlRunId),
      env.DISPLAY_DB.prepare(
        `INSERT INTO crawl_targets (crawl_run_id, target_id, status)
         VALUES (?, '1', 'PENDING')`,
      ).bind(crawlRunId),
    ]);
    const items = Array.from({ length: 50 }, (_, index) => ({
      title: `${'商品'.repeat(100)} ${index % 2 === 0 ? '2枚' : '1枚'}`,
      price: index % 2 === 0 ? 400 : 200,
    }));

    const response = await crawlerRequest(`/runs/${crawlRunId}`, {
      method: 'POST',
      body: JSON.stringify({
        targetId: '1',
        success: true,
        data: {
          imageKey: `screenshots/1/${crawlRunId}.png`,
          items,
        },
      }),
    });
    const saved = await env.DISPLAY_DB.prepare(
      `SELECT
         crawl_runs.status,
         price_points.price,
         screenshots.image_key
       FROM crawl_runs
       INNER JOIN price_points ON price_points.search_condition_id = 1
       INNER JOIN screenshots ON screenshots.search_condition_id = 1
       WHERE crawl_runs.id = ?`,
    )
      .bind(crawlRunId)
      .first();

    expect(response.status).toBe(200);
    expect(saved).toEqual({
      status: 'COMPLETED',
      price: 200,
      image_key: `screenshots/1/${crawlRunId}.png`,
    });
  });

  it('成功済み対象へ同じ結果を再送した時、保存内容を重複させないこと', async () => {
    await env.DISPLAY_DB.batch([
      env.DISPLAY_DB.prepare(
        `INSERT INTO crawl_runs (id, kind, status, expires_at)
         VALUES (?, 'MERCARI', 'RUNNING', '2026-07-23 13:00:00')`,
      ).bind(crawlRunId),
      env.DISPLAY_DB.prepare(
        `INSERT INTO crawl_targets (crawl_run_id, target_id, status)
         VALUES (?, '1', 'PENDING')`,
      ).bind(crawlRunId),
    ]);
    const body = JSON.stringify({
      targetId: '1',
      success: true,
      data: {
        imageKey: `screenshots/1/${crawlRunId}.png`,
        items: [{ title: 'カードA', price: 300 }],
      },
    });
    await crawlerRequest(`/runs/${crawlRunId}`, {
      method: 'POST',
      body,
    });

    const response = await crawlerRequest(`/runs/${crawlRunId}`, {
      method: 'POST',
      body,
    });
    const counts = await env.DISPLAY_DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM price_points) AS price_points,
         (SELECT COUNT(*) FROM screenshots) AS screenshots`,
    ).first();

    expect(await response.json()).toEqual({ accepted: false });
    expect(counts).toEqual({ price_points: 1, screenshots: 1 });
  });

  it('公式商品結果を保存した時、商品名と掲載順を更新すること', async () => {
    await env.DISPLAY_DB.batch([
      env.DISPLAY_DB.prepare(
        `INSERT INTO crawl_runs (id, kind, status, expires_at)
         VALUES (?, 'OFFICIAL_PRODUCTS', 'RUNNING', '2026-07-23 13:00:00')`,
      ).bind(crawlRunId),
      env.DISPLAY_DB.prepare(
        `INSERT INTO crawl_targets (crawl_run_id, target_id, status)
         VALUES (?, 'products', 'PENDING')`,
      ).bind(crawlRunId),
    ]);

    const response = await crawlerRequest(`/runs/${crawlRunId}`, {
      method: 'POST',
      body: JSON.stringify({
        targetId: 'products',
        success: true,
        data: {
          products: [
            { code: '26ex2', name: '更新後の商品名', displayOrder: 3 },
          ],
        },
      }),
    });
    const product = await env.DISPLAY_DB.prepare(
      `SELECT name, display_order FROM products WHERE code = '26ex2'`,
    ).first();

    expect(response.status).toBe(200);
    expect(product).toEqual({ name: '更新後の商品名', display_order: 3 });
  });

  it('カードID結果を保存した時、登録済みを除外して未完了カードへ追加すること', async () => {
    await env.DISPLAY_DB.batch([
      env.DISPLAY_DB.prepare(
        `INSERT INTO crawl_runs
          (id, kind, product_code, status, expires_at)
         VALUES (?, 'OFFICIAL_CARD_IDS', '26ex2', 'RUNNING',
                 '2026-07-23 13:00:00')`,
      ).bind(crawlRunId),
      env.DISPLAY_DB.prepare(
        `INSERT INTO crawl_targets (crawl_run_id, target_id, status)
         VALUES (?, '26ex2', 'PENDING')`,
      ).bind(crawlRunId),
    ]);

    const response = await crawlerRequest(`/runs/${crawlRunId}`, {
      method: 'POST',
      body: JSON.stringify({
        targetId: '26ex2',
        success: true,
        data: { cardIds: ['card-1', 'card-2', 'card-2'] },
      }),
    });
    const pending = await env.DISPLAY_DB.prepare(
      'SELECT id, product_id FROM pending_cards ORDER BY id',
    ).all();

    expect(response.status).toBe(200);
    expect(pending.results).toEqual([{ id: 'card-2', product_id: '26ex2' }]);
  });

  it('カード詳細結果を保存した時、カードを登録して未完了カードから除くこと', async () => {
    await env.DISPLAY_DB.batch([
      env.DISPLAY_DB.prepare(
        `INSERT INTO pending_cards (id, product_id)
         VALUES ('card-2', '26ex2')`,
      ),
      env.DISPLAY_DB.prepare(
        `INSERT INTO crawl_runs
          (id, kind, product_code, status, expires_at)
         VALUES (?, 'OFFICIAL_CARD_DETAILS', '26ex2', 'RUNNING',
                 '2026-07-23 13:00:00')`,
      ).bind(crawlRunId),
      env.DISPLAY_DB.prepare(
        `INSERT INTO crawl_targets (crawl_run_id, target_id, status)
         VALUES (?, 'card-2', 'PENDING')`,
      ).bind(crawlRunId),
    ]);

    const response = await crawlerRequest(`/runs/${crawlRunId}`, {
      method: 'POST',
      body: JSON.stringify({
        targetId: 'card-2',
        success: true,
        data: {
          cardId: 'card-2',
          name: 'カードB',
          imageKey: 'cards/card-2.png',
        },
      }),
    });
    const card = await env.DISPLAY_DB.prepare(
      `SELECT id, name, image_key FROM cards WHERE id = 'card-2'`,
    ).first();
    const pending = await env.DISPLAY_DB.prepare(
      `SELECT id FROM pending_cards WHERE id = 'card-2'`,
    ).first();

    expect(response.status).toBe(200);
    expect(card).toEqual({
      id: 'card-2',
      name: 'カードB',
      image_key: 'cards/card-2.png',
    });
    expect(pending).toBeNull();
  });

  it('最後の2対象が同時に完了した時、一部失敗へ確定すること', async () => {
    await env.DISPLAY_DB.batch([
      env.DISPLAY_DB.prepare(
        `INSERT INTO crawl_runs
          (id, kind, product_code, status, expires_at)
         VALUES (?, 'OFFICIAL_CARD_DETAILS', '26ex2', 'RUNNING',
                 '2026-07-23 13:00:00')`,
      ).bind(crawlRunId),
      env.DISPLAY_DB.prepare(
        `INSERT INTO crawl_targets (crawl_run_id, target_id, status)
         VALUES (?, 'card-2', 'PENDING'), (?, 'card-3', 'PENDING')`,
      ).bind(crawlRunId, crawlRunId),
    ]);

    const [successResponse, failureResponse] = await Promise.all([
      crawlerRequest(`/runs/${crawlRunId}`, {
        method: 'POST',
        body: JSON.stringify({
          targetId: 'card-2',
          success: true,
          data: {
            cardId: 'card-2',
            name: 'カードB',
            imageKey: 'cards/card-2.png',
          },
        }),
      }),
      crawlerRequest(`/runs/${crawlRunId}`, {
        method: 'POST',
        body: JSON.stringify({
          targetId: 'card-3',
          success: false,
          error: '取得に失敗しました',
        }),
      }),
    ]);
    const run = await env.DISPLAY_DB.prepare(
      'SELECT status FROM crawl_runs WHERE id = ?',
    )
      .bind(crawlRunId)
      .first();

    expect(successResponse.status).toBe(200);
    expect(failureResponse.status).toBe(200);
    expect(run).toEqual({ status: 'PARTIALLY_FAILED' });
  });

  it('カードIDが分割単位を超える時、登録済みを除外して残りすべてを未完了カードへ追加すること', async () => {
    await env.DISPLAY_DB.batch([
      env.DISPLAY_DB.prepare(
        `INSERT INTO crawl_runs
          (id, kind, product_code, status, expires_at)
         VALUES (?, 'OFFICIAL_CARD_IDS', '26ex2', 'RUNNING',
                 '2026-07-23 13:00:00')`,
      ).bind(crawlRunId),
      env.DISPLAY_DB.prepare(
        `INSERT INTO crawl_targets (crawl_run_id, target_id, status)
         VALUES (?, '26ex2', 'PENDING')`,
      ).bind(crawlRunId),
    ]);

    const response = await crawlerRequest(`/runs/${crawlRunId}`, {
      method: 'POST',
      body: JSON.stringify({
        targetId: '26ex2',
        success: true,
        data: {
          cardIds: [
            'card-1',
            ...Array.from({ length: 250 }, (_, index) => `bulk-${index}`),
          ],
        },
      }),
    });
    const pending = await env.DISPLAY_DB.prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN id = 'card-1' THEN 1 ELSE 0 END) AS registered
       FROM pending_cards`,
    ).first();

    expect(response.status).toBe(200);
    expect(pending).toEqual({ total: 250, registered: 0 });
  });

  describe('クロール実行の失敗記録', () => {
    beforeEach(async () => {
      await env.DISPLAY_DB.prepare(
        `INSERT INTO crawl_runs
          (id, kind, product_code, status, expires_at)
         VALUES (?, 'OFFICIAL_CARD_IDS', '26ex2', 'RUNNING',
                 '2026-07-23 13:00:00')`,
      )
        .bind(crawlRunId)
        .run();
    });

    it('未完了対象が残っている時、すべて失敗として記録し実行を失敗で確定すること', async () => {
      await env.DISPLAY_DB.prepare(
        `INSERT INTO crawl_targets (crawl_run_id, target_id, status)
         VALUES (?, '26ex2', 'PENDING'), (?, '26ex3', 'PENDING')`,
      )
        .bind(crawlRunId, crawlRunId)
        .run();

      const response = await crawlerRequest(`/runs/${crawlRunId}/failure`, {
        method: 'POST',
        body: JSON.stringify({ error: 'ワークフローが異常終了しました' }),
      });

      const run = await env.DISPLAY_DB.prepare(
        'SELECT status FROM crawl_runs WHERE id = ?',
      )
        .bind(crawlRunId)
        .first();
      const targets = await env.DISPLAY_DB.prepare(
        `SELECT target_id, status, error FROM crawl_targets
         WHERE crawl_run_id = ? ORDER BY target_id`,
      )
        .bind(crawlRunId)
        .all();
      expect(await response.json()).toEqual({ accepted: true });
      expect(run).toEqual({ status: 'FAILED' });
      expect(targets.results).toEqual([
        {
          target_id: '26ex2',
          status: 'FAILED',
          error: 'ワークフローが異常終了しました',
        },
        {
          target_id: '26ex3',
          status: 'FAILED',
          error: 'ワークフローが異常終了しました',
        },
      ]);
    });

    it('成功済みの対象が混在している時、未完了だけを失敗にして一部失敗で確定すること', async () => {
      await env.DISPLAY_DB.prepare(
        `INSERT INTO crawl_targets (crawl_run_id, target_id, status)
         VALUES (?, '26ex2', 'SUCCEEDED'), (?, '26ex3', 'PENDING')`,
      )
        .bind(crawlRunId, crawlRunId)
        .run();

      const response = await crawlerRequest(`/runs/${crawlRunId}/failure`, {
        method: 'POST',
        body: JSON.stringify({ error: 'ワークフローが異常終了しました' }),
      });

      const run = await env.DISPLAY_DB.prepare(
        'SELECT status FROM crawl_runs WHERE id = ?',
      )
        .bind(crawlRunId)
        .first();
      const targets = await env.DISPLAY_DB.prepare(
        `SELECT target_id, status FROM crawl_targets
         WHERE crawl_run_id = ? ORDER BY target_id`,
      )
        .bind(crawlRunId)
        .all();
      expect(response.status).toBe(200);
      expect(run).toEqual({ status: 'PARTIALLY_FAILED' });
      expect(targets.results).toEqual([
        { target_id: '26ex2', status: 'SUCCEEDED' },
        { target_id: '26ex3', status: 'FAILED' },
      ]);
    });

    it('未完了対象がない時、実行の状態を変えないこと', async () => {
      await env.DISPLAY_DB.batch([
        env.DISPLAY_DB.prepare(
          `UPDATE crawl_runs SET status = 'COMPLETED' WHERE id = ?`,
        ).bind(crawlRunId),
        env.DISPLAY_DB.prepare(
          `INSERT INTO crawl_targets (crawl_run_id, target_id, status)
           VALUES (?, '26ex2', 'SUCCEEDED')`,
        ).bind(crawlRunId),
      ]);

      const response = await crawlerRequest(`/runs/${crawlRunId}/failure`, {
        method: 'POST',
        body: JSON.stringify({ error: 'ワークフローが異常終了しました' }),
      });

      const run = await env.DISPLAY_DB.prepare(
        'SELECT status FROM crawl_runs WHERE id = ?',
      )
        .bind(crawlRunId)
        .first();
      const target = await env.DISPLAY_DB.prepare(
        'SELECT status, error FROM crawl_targets WHERE crawl_run_id = ?',
      )
        .bind(crawlRunId)
        .first();
      expect(await response.json()).toEqual({ accepted: false });
      expect(run).toEqual({ status: 'COMPLETED' });
      expect(target).toEqual({ status: 'SUCCEEDED', error: null });
    });

    it('存在しない実行を指定した時、見つからないと応答すること', async () => {
      const response = await crawlerRequest(
        '/runs/22222222-2222-4222-8222-222222222222/failure',
        {
          method: 'POST',
          body: JSON.stringify({ error: 'ワークフローが異常終了しました' }),
        },
      );

      expect(response.status).toBe(404);
    });

    it('失敗理由が空の時、入力値が不正と応答すること', async () => {
      await env.DISPLAY_DB.prepare(
        `INSERT INTO crawl_targets (crawl_run_id, target_id, status)
         VALUES (?, '26ex2', 'PENDING')`,
      )
        .bind(crawlRunId)
        .run();

      const response = await crawlerRequest(`/runs/${crawlRunId}/failure`, {
        method: 'POST',
        body: JSON.stringify({ error: '' }),
      });

      const target = await env.DISPLAY_DB.prepare(
        'SELECT status FROM crawl_targets WHERE crawl_run_id = ?',
      )
        .bind(crawlRunId)
        .first();
      expect(response.status).toBe(400);
      expect(target).toEqual({ status: 'PENDING' });
    });
  });
});
