import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it, onTestFinished } from 'vitest';
import { createApp } from './app';
import { resetDisplayDb } from '@/test-utils/display-db';

describe('カード検索', () => {
  beforeEach(async () => {
    await resetDisplayDb();
    await env.DISPLAY_DB.batch([
      env.DISPLAY_DB.prepare(
        `INSERT INTO products (code, name)
         VALUES ('26ex2', 'カリスマBEST'), ('26rp2', 'ドギラゴン逆の段')`,
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
      { headers: { 'cf-access-jwt-assertion': 'valid-token' } },
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
    });
  });

  it('同名で型番が異なるカードの時、画像の異なる別カードとして取得できること', async () => {
    const sut = createApp({
      verifyAccessToken: async () => 'friend@example.com',
    });

    const response = await sut.request(
      '/api/cards?name=ボルシャック・ドラゴン',
      { headers: { 'cf-access-jwt-assertion': 'valid-token' } },
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
      { headers: { 'cf-access-jwt-assertion': 'valid-token' } },
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
      { headers: { 'cf-access-jwt-assertion': 'valid-token' } },
      env,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      products: [{ code: '26rp2', name: 'ドギラゴン逆の段' }],
    });
  });
});
