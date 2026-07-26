import { describe, expect, it } from 'vitest';
import {
  extractOfficialCardName,
  normalizeOfficialProducts,
  validateOfficialCardIds,
} from './extract';

describe('公式商品一覧', () => {
  it('商品選択肢がある時、重複を除き掲載順を付けること', () => {
    const sut = normalizeOfficialProducts;

    const result = sut([
      { code: '', name: 'すべて' },
      { code: '26ex2', name: ' カリスマBEST ' },
      { code: '26rp2', name: '王道W 第2弾' },
      { code: '26ex2', name: '重複' },
    ]);

    expect(result).toEqual([
      { code: '26ex2', name: 'カリスマBEST', displayOrder: 0 },
      { code: '26rp2', name: '王道W 第2弾', displayOrder: 1 },
    ]);
  });

  it('有効な商品がない時、抽出失敗にすること', () => {
    const sut = normalizeOfficialProducts;

    const result = () => sut([{ code: '', name: 'すべて' }]);

    expect(result).toThrow('商品一覧を抽出できませんでした');
  });
});

describe('公式カードID一覧', () => {
  it('対象商品のカードIDの時、重複を除くこと', () => {
    const sut = validateOfficialCardIds;

    const result = sut(['26ex2-001', 'dm26ex2-002', '26ex2-001'], '26ex2');

    expect(result).toEqual(['26ex2-001', 'dm26ex2-002']);
  });

  it('別商品のカードIDが含まれる時、抽出失敗にすること', () => {
    const sut = validateOfficialCardIds;

    const result = () => sut(['26rp2-001'], '26ex2');

    expect(result).toThrow('商品コードの絞り込みに失敗しました');
  });
});

describe('公式カード名', () => {
  it('商品名を含む時、商品名を除いたカード名を返すこと', () => {
    const sut = extractOfficialCardName;

    const result = sut('ボルシャック・ドラゴンカリスマBEST', 'カリスマBEST');

    expect(result).toBe('ボルシャック・ドラゴン');
  });
});
