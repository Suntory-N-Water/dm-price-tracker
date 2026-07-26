import { describe, expect, it, vi } from 'vitest';
import { retryTarget } from './retry';

describe('対象単位の再試行', () => {
  it('3回目で成功した時、成功結果を返すこと', async () => {
    const sut = retryTarget;
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('1回目'))
      .mockRejectedValueOnce(new Error('2回目'))
      .mockResolvedValue('成功');

    const result = await sut(operation);

    expect(result).toBe('成功');
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('3回とも失敗した時、4回目を実行せず最新エラーを返すこと', async () => {
    const sut = retryTarget;
    const operation = vi
      .fn<() => Promise<never>>()
      .mockRejectedValueOnce(new Error('1回目'))
      .mockRejectedValueOnce(new Error('2回目'))
      .mockRejectedValue(new Error('3回目'));

    const result = sut(operation);

    await expect(result).rejects.toThrow('3回目');
    expect(operation).toHaveBeenCalledTimes(3);
  });
});
