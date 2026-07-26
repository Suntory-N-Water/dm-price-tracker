import { describe, expect, it } from 'vitest';
import { buildMercariSearchUrl, extractYenPrice } from './extract';

describe('メルカリ検索URL', () => {
  it('追加語と除外語がある時、現行の検索条件を引き継ぐこと', () => {
    const sut = buildMercariSearchUrl;

    const result = new URL(
      sut({
        searchConditionId: '1',
        cardName: 'カードA',
        additionalKeyword: '4枚',
        excludeKeyword: '傷',
      }),
    );

    expect(Object.fromEntries(result.searchParams)).toEqual({
      keyword: 'カードA 4枚',
      sort: 'created_time',
      order: 'desc',
      category_id: '1290',
      exclude_keyword: '傷',
    });
    expect(result.hash).toBe('');
  });
});

describe('メルカリの日本円価格', () => {
  it.each([
    ['カードA 1,280円', 1280],
    ['カードA 1,280円 US$8.42', 1280],
  ])('%sの時、日本円価格を返すこと', (label, expected) => {
    const sut = extractYenPrice;

    const result = sut(label);

    expect(result).toBe(expected);
  });

  it('日本円価格が末尾にない時、価格を返さないこと', () => {
    const sut = extractYenPrice;

    const result = sut('カードA US$8.42');

    expect(result).toBeUndefined();
  });
});
