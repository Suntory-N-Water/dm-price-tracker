import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCrawlerTarget } from './retry';

describe('対象単位の再試行と結果報告', () => {
  beforeEach(() => {
    vi.stubEnv('CRAWLER_API_BASE_URL', 'https://example.com');
    vi.stubEnv('CRAWLER_API_KEY', 'api-key');
    vi.stubEnv('CRAWL_RUN_ID', '11111111-1111-4111-8111-111111111111');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 200 })),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('3回目で成功した時、成功結果を1回だけ報告すること', async () => {
    const sut = runCrawlerTarget;
    const operation = vi
      .fn<() => Promise<{ value: string }>>()
      .mockRejectedValueOnce(new Error('1回目'))
      .mockRejectedValueOnce(new Error('2回目'))
      .mockResolvedValue({ value: '成功' });

    const result = await sut({
      targetId: 'target-1',
      label: '対象1',
      operation,
    });
    const request = vi.mocked(fetch).mock.calls[0]?.[1];

    expect(result).toBe(true);
    expect(operation).toHaveBeenCalledTimes(3);
    expect(JSON.parse(String(request?.body))).toEqual({
      targetId: 'target-1',
      success: true,
      data: { value: '成功' },
    });
  });

  it('3回とも失敗した時、4回目を実行せず最新エラーを報告すること', async () => {
    const sut = runCrawlerTarget;
    const operation = vi
      .fn<() => Promise<never>>()
      .mockRejectedValueOnce(new Error('1回目'))
      .mockRejectedValueOnce(new Error('2回目'))
      .mockRejectedValue(new Error('3回目'));

    const result = await sut({
      targetId: 'target-1',
      label: '対象1',
      operation,
    });
    const request = vi.mocked(fetch).mock.calls[0]?.[1];

    expect(result).toBe(false);
    expect(operation).toHaveBeenCalledTimes(3);
    expect(JSON.parse(String(request?.body))).toEqual({
      targetId: 'target-1',
      success: false,
      error: '3回目',
    });
  });
});
