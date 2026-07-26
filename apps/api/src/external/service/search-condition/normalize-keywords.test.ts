import { describe, expect, it } from 'vitest';
import { normalizeKeywords } from './normalize-keywords';

describe('収集条件の正規化', () => {
  describe('正常系', () => {
    it('全角英数字と半角カタカナが含まれる時、英数字は半角、カタカナは全角になること', () => {
      const sut = normalizeKeywords;

      const result = sut(['ＢＯＸ', 'ﾎﾞﾙｼｬｯｸ']);

      expect(result).toEqual(['BOX', 'ボルシャック']);
    });

    it('同じ単語が複数ある時、重複を除いて比較順に並ぶこと', () => {
      const sut = normalizeKeywords;

      const result = sut(['専用', 'まとめ', '専用']);

      expect(result).toEqual(['まとめ', '専用']);
    });

    it('空欄が含まれる時、空欄を除いて正規化されること', () => {
      const sut = normalizeKeywords;

      const result = sut(['', 'まとめ']);

      expect(result).toEqual(['まとめ']);
    });
  });

  describe('異常系', () => {
    it('1枠に空白区切りの複数語がある時、入力エラーになること', () => {
      const sut = normalizeKeywords;

      const act = () => sut(['シークレット 金']);

      expect(act).toThrow('1枠には1単語だけ入力してください');
    });

    it('4枠以上ある時、入力エラーになること', () => {
      const sut = normalizeKeywords;

      const act = () => sut(['1', '2', '3', '4']);

      expect(act).toThrow('ワードは3枠以内で入力してください');
    });
  });
});
