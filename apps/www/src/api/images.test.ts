import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it, onTestFinished } from 'vitest';
import { createApp } from './app';
import { resetDisplayDb } from '@/test-utils/display-db';
import { resetR2 } from '@/test-utils/r2';

describe('画像配信', () => {
  beforeEach(async () => {
    await resetDisplayDb();
    await resetR2();
    await env.DISPLAY_DB.batch([
      env.DISPLAY_DB.prepare(
        `INSERT INTO products (code, name)
         VALUES ('26ex2', 'カリスマBEST')`,
      ),
      env.DISPLAY_DB.prepare(
        `INSERT INTO cards (id, product_id, name, image_key)
         VALUES ('dm26ex2-001', '26ex2', 'カード1', 'cards/one.png')`,
      ),
    ]);
    onTestFinished(async () => {
      await resetDisplayDb();
      await resetR2();
    });
  });

  it('カード画像が保存されている時、R2の画像を取得できること', async () => {
    const sut = createApp({
      verifyAccessToken: async () => 'friend@example.com',
    });
    await env.CARD_IMAGES.put('cards/one.png', 'card-image', {
      httpMetadata: { contentType: 'image/png' },
    });

    const response = await sut.request(
      '/api/cards/dm26ex2-001/image',
      { headers: { 'cf-access-jwt-assertion': 'valid-token' } },
      env,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    await expect(response.arrayBuffer()).resolves.toEqual(
      new TextEncoder().encode('card-image').buffer,
    );
  });

  it('選択した価格点の画像が保存されている時、R2の画像を取得できること', async () => {
    const sut = createApp({
      verifyAccessToken: async () => 'friend@example.com',
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
    const condition = await env.DISPLAY_DB.prepare(
      `SELECT search_condition_id
       FROM card_watches
       WHERE user_email = ? AND card_id = ? AND is_current = 1`,
    )
      .bind('friend@example.com', 'dm26ex2-001')
      .first<{ search_condition_id: number }>();
    await env.DISPLAY_DB.prepare(
      `INSERT INTO screenshots (search_condition_id, crawled_at, image_key)
       VALUES (?, '2026-07-23 10:00:00', 'screenshots/current.png')`,
    )
      .bind(condition?.search_condition_id)
      .run();
    await env.SCREENSHOTS.put('screenshots/current.png', 'screenshot-image', {
      httpMetadata: { contentType: 'image/png' },
    });

    const response = await sut.request(
      '/api/card-watches/dm26ex2-001/screenshots/2026-07-23%2010%3A00%3A00',
      { headers },
      env,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    await expect(response.arrayBuffer()).resolves.toEqual(
      new TextEncoder().encode('screenshot-image').buffer,
    );
  });

  it('選択した価格点の画像が削除済みの時、保存期間終了として取得できないこと', async () => {
    const sut = createApp({
      verifyAccessToken: async () => 'friend@example.com',
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
    const condition = await env.DISPLAY_DB.prepare(
      `SELECT search_condition_id
       FROM card_watches
       WHERE user_email = ? AND card_id = ? AND is_current = 1`,
    )
      .bind('friend@example.com', 'dm26ex2-001')
      .first<{ search_condition_id: number }>();
    await env.DISPLAY_DB.prepare(
      `INSERT INTO screenshots (search_condition_id, crawled_at, image_key)
       VALUES (?, '2026-07-20 10:00:00', 'screenshots/expired.png')`,
    )
      .bind(condition?.search_condition_id)
      .run();

    const response = await sut.request(
      '/api/card-watches/dm26ex2-001/screenshots/2026-07-20%2010%3A00%3A00',
      { headers },
      env,
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: '画像の保存期間が終了しています',
    });
  });
});
