import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it, onTestFinished } from 'vitest';
import { createApp } from './app';
import { resetDisplayDb } from '#api/test-utils/display-db';

describe('価格チェック', () => {
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
           ('dm26ex2-001', '26ex2', 'ボルシャック・ドラゴン', 'cards/one.png'),
           ('dm26ex2-002', '26ex2', 'ボルシャック・ドラゴン', 'cards/two.png')`,
      ),
    ]);
    onTestFinished(resetDisplayDb);
  });

  it('カードを選んだ時、共通除外ワードを使って価格チェックを開始できること', async () => {
    const sut = createApp({
      verifyAccessToken: async () => 'friend@example.com',
    });

    const response = await sut.request(
      '/api/card-watches',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'http://web.test',
          'cf-access-jwt-assertion': 'valid-token',
        },
        body: JSON.stringify({ cardId: 'dm26ex2-001' }),
      },
      env,
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      cardId: 'dm26ex2-001',
      additionalKeywords: [],
      commonExcludeKeywords: ['まとめ', '専用'],
      cardExcludeKeywords: [],
    });
    await expect(
      env.DISPLAY_DB.prepare(
        `SELECT
           price_series.normalized_additional_keyword AS additional_keyword,
           search_conditions.normalized_exclude_keyword AS exclude_keyword,
           card_watches.is_current
         FROM card_watches
         INNER JOIN search_conditions
           ON search_conditions.id = card_watches.search_condition_id
         INNER JOIN price_series
           ON price_series.id = search_conditions.price_series_id
         WHERE card_watches.user_email = ? AND card_watches.card_id = ?`,
      )
        .bind('friend@example.com', 'dm26ex2-001')
        .first(),
    ).resolves.toEqual({
      additional_keyword: '',
      exclude_keyword: 'まとめ 専用',
      is_current: 1,
    });
  });

  it('同一の正規化済み条件がある時、利用者が異なっても収集条件を共有すること', async () => {
    const firstUserApp = createApp({
      verifyAccessToken: async () => 'first@example.com',
    });
    const sut = createApp({
      verifyAccessToken: async () => 'second@example.com',
    });
    const request = {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://web.test',
        'cf-access-jwt-assertion': 'valid-token',
      },
      body: JSON.stringify({ cardId: 'dm26ex2-001' }),
    };
    await firstUserApp.request('/api/card-watches', request, env);

    const response = await sut.request('/api/card-watches', request, env);

    expect(response.status).toBe(201);
    await expect(
      env.DISPLAY_DB.prepare(
        'SELECT count(*) AS count FROM search_conditions',
      ).first(),
    ).resolves.toEqual({ count: 1 });
    await expect(
      env.DISPLAY_DB.prepare(
        'SELECT count(*) AS count FROM card_watches WHERE is_current = 1',
      ).first(),
    ).resolves.toEqual({ count: 2 });
  });

  it('設定を変更した時、以前の履歴行を残して現在の収集条件だけ切り替わること', async () => {
    const sut = createApp({
      verifyAccessToken: async () => 'friend@example.com',
    });
    const headers = {
      'content-type': 'application/json',
      origin: 'http://web.test',
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

    const response = await sut.request(
      '/api/card-watches/dm26ex2-001',
      {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          additionalKeywords: ['金', 'ｼｰｸﾚｯﾄ', '金'],
          cardExcludeKeywords: ['美品'],
        }),
      },
      env,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      cardId: 'dm26ex2-001',
      additionalKeywords: ['シークレット', '金'],
      commonExcludeKeywords: ['まとめ', '専用'],
      cardExcludeKeywords: ['美品'],
    });
    await expect(
      env.DISPLAY_DB.prepare(
        `SELECT
           card_watches.is_current,
           price_series.normalized_additional_keyword AS additional_keyword,
           search_conditions.normalized_exclude_keyword AS exclude_keyword
         FROM card_watches
         INNER JOIN search_conditions
           ON search_conditions.id = card_watches.search_condition_id
         INNER JOIN price_series
           ON price_series.id = search_conditions.price_series_id
         WHERE card_watches.user_email = ? AND card_watches.card_id = ?
         ORDER BY card_watches.id`,
      )
        .bind('friend@example.com', 'dm26ex2-001')
        .all(),
    ).resolves.toMatchObject({
      results: [
        {
          is_current: 0,
          additional_keyword: '',
          exclude_keyword: 'まとめ 専用',
        },
        {
          is_current: 1,
          additional_keyword: 'シークレット 金',
          exclude_keyword: 'まとめ 専用 美品',
        },
      ],
    });
  });

  it('以前と同じ追加ワードへ戻した時、既存の価格系列を再利用すること', async () => {
    const sut = createApp({
      verifyAccessToken: async () => 'friend@example.com',
    });
    const headers = {
      'content-type': 'application/json',
      origin: 'http://web.test',
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
          additionalKeywords: ['金'],
          cardExcludeKeywords: [],
        }),
      },
      env,
    );

    const response = await sut.request(
      '/api/card-watches/dm26ex2-001',
      {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          additionalKeywords: [],
          cardExcludeKeywords: [],
        }),
      },
      env,
    );

    expect(response.status).toBe(200);
    await expect(
      env.DISPLAY_DB.prepare(
        `SELECT count(*) AS count
         FROM price_series
         WHERE card_id = ?`,
      )
        .bind('dm26ex2-001')
        .first(),
    ).resolves.toEqual({ count: 2 });
    await expect(
      env.DISPLAY_DB.prepare(
        `SELECT price_series.normalized_additional_keyword AS additional_keyword
         FROM card_watches
         INNER JOIN search_conditions
           ON search_conditions.id = card_watches.search_condition_id
         INNER JOIN price_series
           ON price_series.id = search_conditions.price_series_id
         WHERE card_watches.user_email = ?
           AND card_watches.card_id = ?
           AND card_watches.is_current = 1`,
      )
        .bind('friend@example.com', 'dm26ex2-001')
        .first(),
    ).resolves.toEqual({ additional_keyword: '' });
  });

  it('追加ワードが4枠以上の時、登録されず現在の設定が維持されること', async () => {
    const sut = createApp({
      verifyAccessToken: async () => 'friend@example.com',
    });
    const headers = {
      'content-type': 'application/json',
      origin: 'http://web.test',
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

    const response = await sut.request(
      '/api/card-watches/dm26ex2-001',
      {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          additionalKeywords: ['1', '2', '3', '4'],
          cardExcludeKeywords: [],
        }),
      },
      env,
    );

    expect(response.status).toBe(400);
    await expect(
      env.DISPLAY_DB.prepare(
        `SELECT count(*) AS count
         FROM card_watches
         WHERE user_email = ? AND card_id = ? AND is_current = 1`,
      )
        .bind('friend@example.com', 'dm26ex2-001')
        .first(),
    ).resolves.toEqual({ count: 1 });
    await expect(
      env.DISPLAY_DB.prepare(
        `SELECT count(*) AS count
         FROM card_watches
         WHERE user_email = ? AND card_id = ?`,
      )
        .bind('friend@example.com', 'dm26ex2-001')
        .first(),
    ).resolves.toEqual({ count: 1 });
  });

  it('価格チェックをやめた時、履歴を削除せず現在行だけ無効になること', async () => {
    const sut = createApp({
      verifyAccessToken: async () => 'friend@example.com',
    });
    const headers = {
      'content-type': 'application/json',
      origin: 'http://web.test',
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

    const response = await sut.request(
      '/api/card-watches/dm26ex2-001',
      { method: 'DELETE', headers },
      env,
    );

    expect(response.status).toBe(204);
    await expect(
      env.DISPLAY_DB.prepare(
        `SELECT is_current
         FROM card_watches
         WHERE user_email = ? AND card_id = ?`,
      )
        .bind('friend@example.com', 'dm26ex2-001')
        .first(),
    ).resolves.toEqual({ is_current: 0 });
  });
});
