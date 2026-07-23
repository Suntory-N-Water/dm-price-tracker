import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it, onTestFinished } from 'vitest';
import { createApp } from './app';
import { resetDisplayDb } from '@/test-utils/display-db';

describe('価格チェック一覧と詳細', () => {
  beforeEach(async () => {
    await resetDisplayDb();
    await env.DISPLAY_DB.batch([
      env.DISPLAY_DB.prepare(
        `INSERT INTO products (code, name)
         VALUES ('26ex2', 'カリスマBEST')`,
      ),
      env.DISPLAY_DB.prepare(
        `INSERT INTO cards (id, product_id, name, image_key)
         VALUES ('dm26ex2-001', '26ex2', 'ボルシャック・ドラゴン', 'cards/one.png')`,
      ),
    ]);
    onTestFinished(resetDisplayDb);
  });

  it('価格詳細の時、本人が使用した除外条件の価格点だけ時系列で取得できること', async () => {
    const sut = createApp({
      verifyAccessToken: async () => 'friend@example.com',
    });
    const otherUserApp = createApp({
      verifyAccessToken: async () => 'other@example.com',
    });
    const headers = {
      'content-type': 'application/json',
      'cf-access-jwt-assertion': 'valid-token',
    };
    await sut.request(
      '/api/card-watches',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ cardId: 'dm26ex2-001' }),
      },
      env,
    );
    await sut.request(
      '/api/card-watches/dm26ex2-001',
      {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          additionalKeywords: [],
          cardExcludeKeywords: ['美品'],
        }),
      },
      env,
    );
    await otherUserApp.request(
      '/api/settings/common-exclude-keywords',
      {
        method: 'PUT',
        headers,
        body: JSON.stringify({ keywords: ['ジャンク'] }),
      },
      env,
    );
    await otherUserApp.request(
      '/api/card-watches',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ cardId: 'dm26ex2-001' }),
      },
      env,
    );
    const conditions = await env.DISPLAY_DB.prepare(
      `SELECT id, normalized_exclude_keyword
       FROM search_conditions
       ORDER BY id`,
    ).all<{ id: number; normalized_exclude_keyword: string }>();
    const conditionByKeyword = new Map(
      conditions.results.map((condition) => [
        condition.normalized_exclude_keyword,
        condition.id,
      ]),
    );
    await env.DISPLAY_DB.batch([
      env.DISPLAY_DB.prepare(
        `INSERT INTO price_points (search_condition_id, crawled_at, price)
         VALUES (?, '2026-07-23 10:00:00', 1000)`,
      ).bind(conditionByKeyword.get('まとめ 専用')),
      env.DISPLAY_DB.prepare(
        `INSERT INTO price_points (search_condition_id, crawled_at, price)
         VALUES (?, '2026-07-23 10:30:00', 900)`,
      ).bind(conditionByKeyword.get('まとめ 専用 美品')),
      env.DISPLAY_DB.prepare(
        `INSERT INTO screenshots (search_condition_id, crawled_at, image_key)
         VALUES (?, '2026-07-23 10:30:00', 'screenshots/two.png')`,
      ).bind(conditionByKeyword.get('まとめ 専用 美品')),
      env.DISPLAY_DB.prepare(
        `INSERT INTO price_points (search_condition_id, crawled_at, price)
         VALUES (?, '2026-07-23 10:15:00', 100)`,
      ).bind(conditionByKeyword.get('ジャンク')),
    ]);

    const response = await sut.request(
      '/api/card-watches/dm26ex2-001/price-history',
      { headers },
      env,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      card: {
        id: 'dm26ex2-001',
        name: 'ボルシャック・ドラゴン',
        imageUrl: '/api/cards/dm26ex2-001/image',
      },
      currentPrice: 900,
      pricePoints: [
        {
          crawledAt: '2026-07-23 10:00:00',
          price: 1000,
          screenshotUrl: null,
        },
        {
          crawledAt: '2026-07-23 10:30:00',
          price: 900,
          screenshotUrl:
            '/api/card-watches/dm26ex2-001/screenshots/2026-07-23%2010%3A30%3A00',
        },
      ],
    });
  });

  it('価格チェック一覧の時、本人の現在の設定だけ取得できること', async () => {
    const sut = createApp({
      verifyAccessToken: async () => 'friend@example.com',
    });
    const otherUserApp = createApp({
      verifyAccessToken: async () => 'other@example.com',
    });
    const headers = {
      'content-type': 'application/json',
      'cf-access-jwt-assertion': 'valid-token',
    };
    await sut.request(
      '/api/card-watches',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ cardId: 'dm26ex2-001' }),
      },
      env,
    );
    await otherUserApp.request(
      '/api/card-watches',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ cardId: 'dm26ex2-001' }),
      },
      env,
    );
    const condition = await env.DISPLAY_DB.prepare(
      `SELECT search_condition_id
       FROM card_watches
       WHERE user_email = ? AND card_id = ? AND is_current = 1`,
    )
      .bind('friend@example.com', 'dm26ex2-001')
      .first<{ search_condition_id: number }>();
    await env.DISPLAY_DB.prepare(
      `INSERT INTO price_points (search_condition_id, crawled_at, price)
       VALUES (?, '2026-07-23 11:00:00', 800)`,
    )
      .bind(condition?.search_condition_id)
      .run();

    const response = await sut.request(
      '/api/card-watches?name=ドラゴン&productCode=26ex2',
      { headers },
      env,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      watches: [
        {
          card: {
            id: 'dm26ex2-001',
            name: 'ボルシャック・ドラゴン',
            imageUrl: '/api/cards/dm26ex2-001/image',
            product: { code: '26ex2', name: 'カリスマBEST' },
          },
          additionalKeywords: [],
          commonExcludeKeywords: ['まとめ', '専用'],
          cardExcludeKeywords: [],
          currentPrice: 800,
          crawledAt: '2026-07-23 11:00:00',
        },
      ],
    });
  });
});
