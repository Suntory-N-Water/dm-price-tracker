import { describe, expect, it } from 'vitest';
import { createTargetBatches } from './crawler-api';

describe('クロール対象のバッチ分割', () => {
  it('11件の対象がある時、10件と1件に分割すること', () => {
    const sut = createTargetBatches;
    const targets = Array.from({ length: 11 }, (_, index) => String(index));

    const result = sut(targets);

    expect(result).toEqual([
      ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
      ['10'],
    ]);
  });

  it('2560件を超える対象がある時、256バッチまで返すこと', () => {
    const sut = createTargetBatches;
    const targets = Array.from({ length: 2561 }, (_, index) => String(index));

    const result = sut(targets);

    expect(result).toHaveLength(256);
    expect(result.at(-1)).toHaveLength(10);
  });
});
