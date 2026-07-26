import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it, onTestFinished } from 'vitest';
import { createApp } from './app';
import { resetDisplayDb } from '@/test-utils/display-db';

describe('除外ワード', () => {
  beforeEach(async () => {
    await resetDisplayDb();
    await env.DISPLAY_DB.batch([
      env.DISPLAY_DB.prepare(
        `INSERT INTO products (code, name)
         VALUES ('26ex2', 'カリスマBEST')`,
      ),
      env.DISPLAY_DB.prepare(
        `INSERT INTO cards (id, product_id, name, image_key)
         VALUES
           ('dm26ex2-001', '26ex2', 'カード1', 'cards/one.png'),
           ('dm26ex2-002', '26ex2', 'カード2', 'cards/two.png')`,
      ),
    ]);
    onTestFinished(resetDisplayDb);
  });

  it('共通除外ワードを変更した時、価格チェック中の全カードへ即時反映されること', async () => {
    const sut = createApp({
      verifyAccessToken: async () => 'friend@example.com',
    });
    const headers = {
      'content-type': 'application/json',
      'cf-access-jwt-assertion': 'valid-token',
    };
    for (const cardId of ['dm26ex2-001', 'dm26ex2-002']) {
      await sut.request(
        '/api/card-watches',
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ cardId }),
        },
        env,
      );
    }
    await sut.request(
      '/api/card-watches/dm26ex2-002',
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

    const response = await sut.request(
      '/api/settings/common-exclude-keywords',
      {
        method: 'PUT',
        headers,
        body: JSON.stringify({ keywords: ['まとめ'] }),
      },
      env,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      keywords: ['まとめ'],
      updatedCardCount: 2,
    });
    await expect(
      env.DISPLAY_DB.prepare(
        `SELECT
           card_watches.card_id,
           search_conditions.normalized_exclude_keyword AS exclude_keyword
         FROM card_watches
         INNER JOIN search_conditions
           ON search_conditions.id = card_watches.search_condition_id
         WHERE card_watches.user_email = ? AND card_watches.is_current = 1
         ORDER BY card_watches.card_id`,
      )
        .bind('friend@example.com')
        .all(),
    ).resolves.toMatchObject({
      results: [
        { card_id: 'dm26ex2-001', exclude_keyword: 'まとめ' },
        { card_id: 'dm26ex2-002', exclude_keyword: 'まとめ 美品' },
      ],
    });
  });

  it('一括追加の時、空き枠のあるカードだけ変更され満杯のカードはスキップされること', async () => {
    const sut = createApp({
      verifyAccessToken: async () => 'friend@example.com',
    });
    const headers = {
      'content-type': 'application/json',
      'cf-access-jwt-assertion': 'valid-token',
    };
    for (const cardId of ['dm26ex2-001', 'dm26ex2-002']) {
      await sut.request(
        '/api/card-watches',
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ cardId }),
        },
        env,
      );
    }
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

    const response = await sut.request(
      '/api/card-watches/bulk-exclude-keyword',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          cardIds: ['dm26ex2-001', 'dm26ex2-002'],
          excludeKeyword: 'ジャンク',
        }),
      },
      env,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      updated: [{ cardId: 'dm26ex2-002' }],
      skipped: [
        {
          cardId: 'dm26ex2-001',
          reason: '除外ワードの空き枠がありません',
        },
      ],
    });
  });

  it('一括追加の対象が分割単位を超える時、すべてのカードへ反映されること', async () => {
    const sut = createApp({
      verifyAccessToken: async () => 'friend@example.com',
    });
    const cardIds = Array.from(
      { length: 100 },
      (_, index) => `dm26ex2-bulk-${index}`,
    );
    await env.DISPLAY_DB.batch([
      env.DISPLAY_DB.prepare(
        `INSERT INTO users (email) VALUES ('friend@example.com')`,
      ),
      env.DISPLAY_DB.prepare(
        `INSERT INTO cards (id, product_id, name, image_key)
         SELECT value, '26ex2', 'カード', 'cards/bulk.png' FROM json_each(?)`,
      ).bind(JSON.stringify(cardIds)),
      env.DISPLAY_DB.prepare(
        `INSERT INTO price_series (card_id) SELECT value FROM json_each(?)`,
      ).bind(JSON.stringify(cardIds)),
      env.DISPLAY_DB.prepare(
        `INSERT INTO search_conditions (price_series_id)
         SELECT id FROM price_series`,
      ),
      env.DISPLAY_DB.prepare(
        `INSERT INTO card_watches (user_email, card_id, search_condition_id)
         SELECT 'friend@example.com', price_series.card_id, search_conditions.id
         FROM search_conditions
         INNER JOIN price_series ON price_series.id = search_conditions.price_series_id`,
      ),
    ]);

    const response = await sut.request(
      '/api/card-watches/bulk-exclude-keyword',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'cf-access-jwt-assertion': 'valid-token',
        },
        body: JSON.stringify({ cardIds, excludeKeyword: 'ジャンク' }),
      },
      env,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      updated: cardIds.map((cardId) => ({ cardId })),
      skipped: [],
    });
    await expect(
      env.DISPLAY_DB.prepare(
        `SELECT COUNT(*) AS total
         FROM card_watches
         INNER JOIN search_conditions
           ON search_conditions.id = card_watches.search_condition_id
         WHERE card_watches.user_email = ?
           AND card_watches.is_current = 1
           AND search_conditions.normalized_exclude_keyword LIKE '%ジャンク%'`,
      )
        .bind('friend@example.com')
        .first(),
    ).resolves.toEqual({ total: 100 });
  });
});
