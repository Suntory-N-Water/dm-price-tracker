import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient, parseApiResponse, SessionExpiredError } from './client';

describe('Hono API client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('APIを呼び出した時、Access cookieを含めること', async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(input, init);
        expect(request.credentials).toBe('include');
        return Response.json({ products: [] });
      },
    );
    vi.stubGlobal('fetch', fetchMock);

    await apiClient.api.products.$get({ query: {} });

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('AccessのHTML応答を受けた時、セッション切れとして扱うこと', async () => {
    const response = new Response('<html>Access login</html>', {
      status: 403,
      headers: { 'content-type': 'text/html' },
    });

    const act = () => parseApiResponse(response);

    await expect(act).rejects.toEqual(new SessionExpiredError(403));
  });
});
