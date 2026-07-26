import { describe, expect, it } from 'vitest';
import { calculateMedianUnitPrice } from './priceAggregation';

describe('商品の1枚あたり価格の中央値', () => {
  it('枚数表記がない時、1枚として中央値を返すこと', () => {
    const sut = calculateMedianUnitPrice;
    const items = [
      { title: 'カード A', price: 300 },
      { title: 'カード B', price: 100 },
      { title: 'カード C', price: 200 },
    ];

    const result = sut(items);

    expect(result).toBe(200);
  });

  it('半角・全角の枚数表記がある時、1枚あたり価格から中央値を返すこと', () => {
    const sut = calculateMedianUnitPrice;
    const items = [
      { title: 'カード 2枚', price: 600 },
      { title: 'カード ４ 枚', price: 800 },
    ];

    const result = sut(items);

    expect(result).toBe(250);
  });

  it('商品が偶数件の時、中央値を四捨五入すること', () => {
    const sut = calculateMedianUnitPrice;
    const items = [
      { title: 'カード 2枚', price: 201 },
      { title: 'カード', price: 200 },
    ];

    const result = sut(items);

    expect(result).toBe(150);
  });

  it('商品がない時、価格点を生成しないこと', () => {
    const sut = calculateMedianUnitPrice;

    const result = sut([]);

    expect(result).toBeUndefined();
  });
});
