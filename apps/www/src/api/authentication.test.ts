import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it, onTestFinished } from 'vitest';
import { createApp } from './app';
import { resetDisplayDb } from '@/test-utils/display-db';

describe('Cloudflare Access認証', () => {
  beforeEach(async () => {
    await resetDisplayDb();
    onTestFinished(resetDisplayDb);
  });

  it('有効なJWTの時、利用者を自動登録してAPIを利用できること', async () => {
    const sut = createApp({
      verifyAccessToken: async () => 'friend@example.com',
    });

    const response = await sut.request(
      '/api/settings/common-exclude-keywords',
      { headers: { 'cf-access-jwt-assertion': 'valid-token' } },
      env,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      keywords: ['まとめ', '専用'],
    });
    await expect(
      env.DISPLAY_DB.prepare('SELECT email FROM users WHERE email = ?')
        .bind('friend@example.com')
        .first(),
    ).resolves.toEqual({ email: 'friend@example.com' });
  });

  it('JWTがない時、認証エラーになり利用者が登録されないこと', async () => {
    const sut = createApp({
      verifyAccessToken: async () => 'friend@example.com',
    });

    const response = await sut.request(
      '/api/settings/common-exclude-keywords',
      undefined,
      env,
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: '認証が必要です',
    });
    await expect(
      env.DISPLAY_DB.prepare('SELECT count(*) AS count FROM users').first(),
    ).resolves.toEqual({ count: 0 });
  });

  it('開発用利用者が設定されている時、JWTなしで一般APIを利用できること', async () => {
    const sut = createApp({
      localAuthentication: {
        email: 'developer@example.com',
        isAdmin: false,
      },
    });

    const response = await sut.request(
      '/api/settings/common-exclude-keywords',
      undefined,
      env,
    );

    expect(response.status).toBe(200);
    await expect(
      env.DISPLAY_DB.prepare('SELECT email FROM users WHERE email = ?')
        .bind('developer@example.com')
        .first(),
    ).resolves.toEqual({ email: 'developer@example.com' });
  });

  it('開発用利用者に管理者権限がない時、管理APIを利用できないこと', async () => {
    const sut = createApp({
      localAuthentication: {
        email: 'developer@example.com',
        isAdmin: false,
      },
    });

    const response = await sut.request('/api/admin/products', undefined, env);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: '管理者権限が必要です',
    });
  });

  it('開発用管理者が設定されている時、JWTなしで管理APIを利用できること', async () => {
    const sut = createApp({
      localAuthentication: {
        email: 'developer@example.com',
        isAdmin: true,
      },
    });
    const bindings = {
      ...env,
      OFFICIAL_CRAWLER: {
        crawl: async () => ({ id: 'unused', status: { status: 'complete' } }),
        syncProducts: async () => ({ syncedCount: 0 }),
        listProductCrawls: async () => [],
      } as unknown as CloudflareEnv['OFFICIAL_CRAWLER'],
    };

    const response = await sut.request(
      '/api/admin/products',
      undefined,
      bindings,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ products: [] });
  });

  it('JWTの検証に失敗した時、認証エラーになり利用者が登録されないこと', async () => {
    const sut = createApp({
      verifyAccessToken: async () => {
        throw new Error('署名が不正です');
      },
    });

    const response = await sut.request(
      '/api/settings/common-exclude-keywords',
      { headers: { 'cf-access-jwt-assertion': 'invalid-token' } },
      env,
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: '認証トークンが不正です',
    });
    await expect(
      env.DISPLAY_DB.prepare('SELECT count(*) AS count FROM users').first(),
    ).resolves.toEqual({ count: 0 });
  });
});
