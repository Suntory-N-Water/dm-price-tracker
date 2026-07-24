import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it, onTestFinished } from 'vitest';
import { createApp } from './app';
import { resetDisplayDb } from '@/test-utils/display-db';

type OfficialCrawlerMock = {
  crawl(productCode: string): Promise<{ id: string; status: InstanceStatus }>;
  syncProducts(): Promise<{ syncedCount: number }>;
  listProductCrawls(): Promise<
    {
      productCode: string;
      status: 'WAITING' | 'RUNNING' | 'FINISHED' | 'ABORTED';
      updatedAt: string;
      error: string | null;
    }[]
  >;
};

function createBindings(officialCrawler: OfficialCrawlerMock): CloudflareEnv {
  return {
    ...env,
    DISPLAY_DB: env.DISPLAY_DB,
    CARD_IMAGES: env.CARD_IMAGES,
    SCREENSHOTS: env.SCREENSHOTS,
    OFFICIAL_CRAWLER: officialCrawler as CloudflareEnv['OFFICIAL_CRAWLER'],
    TEAM_DOMAIN: 'https://example.cloudflareaccess.com',
    POLICY_AUD: 'user-audience',
    ADMIN_POLICY_AUD: 'admin-audience',
    ADMIN_EMAIL: 'admin@example.com',
  };
}

describe('管理API', () => {
  beforeEach(async () => {
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

  it('管理商品一覧の時、開始済み商品の取得状態を取得できること', async () => {
    const sut = createApp({
      verifyAccessToken: async () => 'admin@example.com',
    });
    const bindings = createBindings({
      crawl: async () => ({ id: 'unused', status: { status: 'complete' } }),
      syncProducts: async () => ({ syncedCount: 0 }),
      listProductCrawls: async () => [
        {
          productCode: '26ex2',
          status: 'RUNNING',
          updatedAt: '2026-07-23 12:00:00',
          error: null,
        },
      ],
    });

    const response = await sut.request(
      '/api/admin/products',
      { headers: { 'cf-access-jwt-assertion': 'valid-token' } },
      bindings,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      products: [
        {
          code: '26ex2',
          name: 'カリスマBEST',
          status: 'RUNNING',
          updatedAt: '2026-07-23 12:00:00',
          error: null,
        },
      ],
    });
  });

  it('未開始商品を検索した時、開始済み商品を除外して取得できること', async () => {
    const sut = createApp({
      verifyAccessToken: async () => 'admin@example.com',
    });
    const bindings = createBindings({
      crawl: async () => ({ id: 'unused', status: { status: 'complete' } }),
      syncProducts: async () => ({ syncedCount: 0 }),
      listProductCrawls: async () => [
        {
          productCode: '26ex2',
          status: 'FINISHED',
          updatedAt: '2026-07-23 12:00:00',
          error: null,
        },
      ],
    });

    const response = await sut.request(
      '/api/admin/products/available?name=%E9%80%86%E3%81%AE%E6%AE%B5',
      { headers: { 'cf-access-jwt-assertion': 'valid-token' } },
      bindings,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      products: [{ code: '26rp2', name: 'ドギラゴン逆の段' }],
    });
  });

  it('未開始商品を取得した時、公式サイトの商品順で取得できること', async () => {
    const sut = createApp({
      verifyAccessToken: async () => 'admin@example.com',
    });
    const bindings = createBindings({
      crawl: async () => ({ id: 'unused', status: { status: 'complete' } }),
      syncProducts: async () => ({ syncedCount: 0 }),
      listProductCrawls: async () => [],
    });

    const response = await sut.request(
      '/api/admin/products/available',
      { headers: { 'cf-access-jwt-assertion': 'valid-token' } },
      bindings,
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

  it('商品一覧を更新した時、公式クローラーの同期結果を取得できること', async () => {
    const sut = createApp({
      verifyAccessToken: async () => 'admin@example.com',
    });
    const bindings = createBindings({
      crawl: async () => ({ id: 'unused', status: { status: 'complete' } }),
      syncProducts: async () => ({ syncedCount: 12 }),
      listProductCrawls: async () => [],
    });

    const response = await sut.request(
      '/api/admin/products/sync',
      {
        method: 'POST',
        headers: { 'cf-access-jwt-assertion': 'valid-token' },
      },
      bindings,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ syncedCount: 12 });
  });

  it('商品を追加した時、商品単位のクロールを開始できること', async () => {
    const sut = createApp({
      verifyAccessToken: async () => 'admin@example.com',
    });
    const bindings = createBindings({
      crawl: async () => ({ id: 'workflow-1', status: { status: 'running' } }),
      syncProducts: async () => ({ syncedCount: 0 }),
      listProductCrawls: async () => [],
    });

    const response = await sut.request(
      '/api/admin/products/26ex2/crawl',
      {
        method: 'POST',
        headers: { 'cf-access-jwt-assertion': 'valid-token' },
      },
      bindings,
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      id: 'workflow-1',
      status: { status: 'running' },
    });
  });

  it('管理者以外の時、管理APIを利用できないこと', async () => {
    const sut = createApp({
      verifyAccessToken: async () => 'friend@example.com',
    });
    const bindings = createBindings({
      crawl: async () => ({ id: 'unused', status: { status: 'complete' } }),
      syncProducts: async () => ({ syncedCount: 0 }),
      listProductCrawls: async () => [],
    });

    const response = await sut.request(
      '/api/admin/products',
      { headers: { 'cf-access-jwt-assertion': 'valid-token' } },
      bindings,
    );

    expect(response.status).toBe(403);
  });
});
