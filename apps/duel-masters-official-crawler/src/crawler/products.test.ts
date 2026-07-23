import { describe, expect, it } from 'vitest';
import { extractProducts } from './products';

describe('公式サイトの商品一覧', () => {
  it('商品選択肢がある時、商品コードと名称を抽出できること', () => {
    const sut = extractProducts;
    const html = `
      <select name="products">
        <option value="">商品を選択</option>
        <option value="26ex2">DM26-EX2 悪感謝祭 カリスマBEST</option>
        <option value="26rp2">DM26-RP2 ドギラゴン逆の段</option>
      </select>
    `;

    const result = sut(html);

    expect(result).toEqual([
      { code: '26ex2', name: 'DM26-EX2 悪感謝祭 カリスマBEST' },
      { code: '26rp2', name: 'DM26-RP2 ドギラゴン逆の段' },
    ]);
  });

  it('同じ商品が複数ある時、重複を除いて取得できること', () => {
    const sut = extractProducts;
    const html = `
      <select name="products">
        <option value="26ex2">カリスマBEST</option>
        <option value="26ex2">カリスマBEST</option>
      </select>
    `;

    const result = sut(html);

    expect(result).toEqual([{ code: '26ex2', name: 'カリスマBEST' }]);
  });

  it('商品を抽出できない時、同期エラーになること', () => {
    const sut = extractProducts;

    const act = () => sut('<html></html>');

    expect(act).toThrow('商品一覧を抽出できませんでした');
  });
});
