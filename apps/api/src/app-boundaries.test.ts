import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { createApp } from './app';

const bindings = {
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
  WEB_ORIGIN: 'https://web.example.com',
} satisfies CloudflareEnv;

describe('WebとAPIの境界', () => {
  it('healthを確認した時、認証なしで正常応答を返すこと', async () => {
    const sut = createApp();

    const response = await sut.request('/api/health', {}, bindings);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it('許可originからpreflightした時、credentialsと限定した条件を返すこと', async () => {
    const sut = createApp();

    const response = await sut.request(
      '/api/cards',
      {
        method: 'OPTIONS',
        headers: {
          origin: 'https://web.example.com',
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'Content-Type',
        },
      },
      bindings,
    );

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe(
      'https://web.example.com',
    );
    expect(response.headers.get('access-control-allow-credentials')).toBe(
      'true',
    );
    expect(response.headers.get('access-control-allow-methods')).toBe(
      'GET,HEAD,POST,PUT,DELETE,OPTIONS',
    );
    expect(response.headers.get('access-control-allow-headers')).toBe(
      'Content-Type',
    );
  });

  it('許可外originからpreflightした時、許可originを返さないこと', async () => {
    const sut = createApp();

    const response = await sut.request(
      '/api/cards',
      {
        method: 'OPTIONS',
        headers: {
          origin: 'https://attacker.example',
          'access-control-request-method': 'POST',
        },
      },
      bindings,
    );

    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('許可外originから更新した時、CSRFとして拒否すること', async () => {
    const sut = createApp({
      localAuthentication: {
        email: 'developer@example.com',
        isAdmin: true,
      },
    });

    const response = await sut.request(
      '/api/card-watches',
      {
        method: 'POST',
        headers: {
          origin: 'https://attacker.example',
          'content-type': 'text/plain',
        },
        body: JSON.stringify({ cardId: 'dm26ex2-001' }),
      },
      bindings,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'リクエスト元が不正です',
    });
  });
});
