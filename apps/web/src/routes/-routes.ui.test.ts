import { QueryClient } from '@tanstack/react-query';
import { createMemoryHistory, createRouter } from '@tanstack/react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { routeTree } from '@/routeTree.gen';

function createTestRouter(path: string) {
  return createRouter({
    routeTree,
    context: { queryClient: new QueryClient() },
    history: createMemoryHistory({ initialEntries: [path] }),
    defaultPreloadStaleTime: 0,
  });
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('route loader', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('ルートを表示した時、価格チェック一覧へ転送すること', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const path = new URL(
          input instanceof Request ? input.url : String(input),
        ).pathname;
        return path === '/api/products'
          ? jsonResponse({ products: [] })
          : jsonResponse({ watches: [] });
      }),
    );
    const sut = createTestRouter('/');

    await sut.load();

    expect(sut.state.location.pathname).toBe('/watches');
  });

  it.each([
    401, 403,
  ])('管理APIが$statusを返した時、価格チェック一覧へ転送すること', async (status) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const path = new URL(
          input instanceof Request ? input.url : String(input),
        ).pathname;
        if (path.startsWith('/api/admin/')) {
          return jsonResponse({ error: '管理画面を利用できません' }, status);
        }
        return path === '/api/products'
          ? jsonResponse({ products: [] })
          : jsonResponse({ watches: [] });
      }),
    );
    const sut = createTestRouter('/admin/products');

    await sut.load();

    expect(sut.state.location.pathname).toBe('/watches');
  });

  it.each([
    ['/', '/watches'],
    ['/watches', '/watches'],
    ['/watches/dm26ex2-001', '/watches/dm26ex2-001'],
    ['/cards', '/cards'],
    ['/settings/common-exclude-keywords', '/settings/common-exclude-keywords'],
    ['/admin', '/admin/products'],
    ['/admin/products', '/admin/products'],
  ])('%sを読み込んだ時、%sを表示すること', async (path, expectedPath) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const apiPath = new URL(
          input instanceof Request ? input.url : String(input),
        ).pathname;
        if (apiPath.endsWith('/price-history')) {
          return jsonResponse({
            card: {
              imageUrl: '/api/cards/dm26ex2-001/image',
              product: { code: '26ex2', name: 'カリスマBEST' },
            },
            pricePoints: [],
          });
        }
        if (apiPath === '/api/card-watches') {
          return jsonResponse({ watches: [] });
        }
        if (apiPath === '/api/cards') {
          return jsonResponse({ cards: [], pageCount: 1 });
        }
        if (apiPath === '/api/settings/common-exclude-keywords') {
          return jsonResponse({ keywords: [] });
        }
        if (apiPath === '/api/admin/products/available') {
          return jsonResponse({ products: [] });
        }
        if (apiPath === '/api/admin/products') {
          return jsonResponse({
            products: [],
            mercariCrawl: null,
            officialProductsCrawl: null,
          });
        }
        return jsonResponse({ products: [] });
      }),
    );
    const sut = createTestRouter(path);

    await sut.load();

    expect(sut.state.location.pathname).toBe(expectedPath);
    expect(sut.state.matches.at(-1)?.status).toBe('success');
  });

  it('価格履歴が存在しない時、not-foundとして扱うこと', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const path = new URL(
          input instanceof Request ? input.url : String(input),
        ).pathname;
        if (path.endsWith('/price-history')) {
          return jsonResponse(
            { error: '価格チェック中のカードが見つかりません' },
            404,
          );
        }
        return jsonResponse({ watches: [] });
      }),
    );
    const sut = createTestRouter('/watches/missing-card');

    await sut.load();

    expect(sut.state.matches.some((match) => match.status === 'notFound')).toBe(
      true,
    );
  });
});
