import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it, onTestFinished } from 'vitest';
import { createApp } from './app';
import { resetDisplayDb } from '#api/test-utils/display-db';

describe('カード検索', () => {
  beforeEach(async () => {
    await resetDisplayDb();
    await env.DISPLAY_DB.batch([
      env.DISPLAY_DB.prepare(
        `INSERT INTO products (code, name)
         VALUES
           ('26ex2', 'カリスマBEST'),
           ('26rp2', 'ドギラゴン逆の段'),
           ('25rp4', 'クロール前の商品')`,
      ),
      env.DISPLAY_DB.prepare(
        `INSERT INTO cards (id, product_id, name, image_key)
         VALUES
           ('dm26ex2-001', '26ex2', 'ボルシャック・ドラゴン', 'cards/one.png'),
           ('dm26ex2-002', '26ex2', 'ボルシャック・ドラゴン', 'cards/two.png'),
           ('dm26rp2-001', '26rp2', 'ボルシャック・NEX', 'cards/three.png')`,
      ),
    ]);
    onTestFinished(resetDisplayDb);
  });

  it('カード名と商品を指定した時、両方に一致するカードだけ取得できること', async () => {
    const sut = createApp({
      verifyAccessToken: async () => 'friend@example.com',
    });

    const response = await sut.request(
      '/api/cards?name=ドラゴン&productCode=26ex2',
      {
        headers: {
          origin: 'http://web.test',
          'cf-access-jwt-assertion': 'valid-token',
        },
      },
      env,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      cards: [
        {
          id: 'dm26ex2-001',
          name: 'ボルシャック・ドラゴン',
          imageUrl: '/api/cards/dm26ex2-001/image',
          product: { code: '26ex2', name: 'カリスマBEST' },
          isWatching: false,
        },
        {
          id: 'dm26ex2-002',
          name: 'ボルシャック・ドラゴン',
          imageUrl: '/api/cards/dm26ex2-002/image',
          product: { code: '26ex2', name: 'カリスマBEST' },
          isWatching: false,
        },
      ],
      pageCount: 1,
    });
  });

  it('1ページ分を超える時、指定ページのカードと総ページ数を取得できること', async () => {
    const sut = createApp({
      verifyAccessToken: async () => 'friend@example.com',
    });
    await env.DISPLAY_DB.prepare(
      `INSERT INTO cards (id, product_id, name, image_key)
       SELECT 'dm26rp2-' || printf('%03d', value), '26rp2', 'ページングカード' || value, 'cards/paging.png'
       FROM (WITH RECURSIVE numbers(value) AS (
               SELECT 10 UNION ALL SELECT value + 1 FROM numbers WHERE value < 25
             ) SELECT value FROM numbers)`,
    ).run();

    const response = await sut.request(
      '/api/cards?page=2',
      {
        headers: {
          origin: 'http://web.test',
          'cf-access-jwt-assertion': 'valid-token',
        },
      },
      env,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      cards: { id: string }[];
      pageCount: number;
    };
    // カード総数は既存3件と追加16件で19件
    expect(body.pageCount).toBe(2);
    expect(body.cards.map((card) => card.id)).toEqual(['dm26rp2-025']);
  });

  it('同名で型番が異なるカードの時、画像の異なる別カードとして取得できること', async () => {
    const sut = createApp({
      verifyAccessToken: async () => 'friend@example.com',
    });

    const response = await sut.request(
      '/api/cards?name=ボルシャック・ドラゴン',
      {
        headers: {
          origin: 'http://web.test',
          'cf-access-jwt-assertion': 'valid-token',
        },
      },
      env,
    );

    const body = (await response.json()) as {
      cards: { id: string; imageUrl: string }[];
    };
    expect(body.cards).toHaveLength(2);
    expect(body.cards.map(({ id, imageUrl }) => ({ id, imageUrl }))).toEqual([
      {
        id: 'dm26ex2-001',
        imageUrl: '/api/cards/dm26ex2-001/image',
      },
      {
        id: 'dm26ex2-002',
        imageUrl: '/api/cards/dm26ex2-002/image',
      },
    ]);
  });

  it('検索条件が不正な時、バリデーションエラーになること', async () => {
    const sut = createApp({
      verifyAccessToken: async () => 'friend@example.com',
    });

    const response = await sut.request(
      `/api/cards?name=${'あ'.repeat(101)}`,
      {
        headers: {
          origin: 'http://web.test',
          'cf-access-jwt-assertion': 'valid-token',
        },
      },
      env,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: '入力値が不正です',
    });
  });

  it('商品を検索した時、カード絞り込みに使う商品一覧を取得できること', async () => {
    const sut = createApp({
      verifyAccessToken: async () => 'friend@example.com',
    });

    const response = await sut.request(
      '/api/products?name=逆の段',
      {
        headers: {
          origin: 'http://web.test',
          'cf-access-jwt-assertion': 'valid-token',
        },
      },
      env,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      products: [{ code: '26rp2', name: 'ドギラゴン逆の段' }],
    });
  });

  it('カード情報を取得していない商品がある時、絞り込み候補に含まれないこと', async () => {
    const sut = createApp({
      verifyAccessToken: async () => 'friend@example.com',
    });

    const response = await sut.request(
      '/api/products',
      {
        headers: {
          origin: 'http://web.test',
          'cf-access-jwt-assertion': 'valid-token',
        },
      },
      env,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      products: [
        { code: '26ex2', name: 'カリスマBEST' },
        { code: '26rp2', name: 'ドギラゴン逆の段' },
      ],
    });
  });
});
