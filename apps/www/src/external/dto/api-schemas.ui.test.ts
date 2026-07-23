import { describe, expect, it } from 'vitest';
import * as v from 'valibot';
import {
  cardListResponseSchema,
  cardWatchFormSchema,
  priceHistoryResponseSchema,
} from './api-schemas';

describe('画面で扱うデータの検証', () => {
  it('カード一覧APIが正しい時、画面用データとして受け取れること', () => {
    const response = {
      cards: [
        {
          id: 'dm26ex2-001',
          name: 'ボルシャック・ドラゴン',
          imageUrl: '/api/cards/dm26ex2-001/image',
          product: { code: '26ex2', name: 'カリスマBEST' },
          isWatching: false,
        },
      ],
    };

    const result = v.parse(cardListResponseSchema, response);

    expect(result.cards[0]?.name).toBe('ボルシャック・ドラゴン');
  });

  it('価格履歴APIの価格が文字列の時、画面へ渡さずエラーになること', () => {
    const response = {
      card: {
        id: 'dm26ex2-001',
        name: 'ボルシャック・ドラゴン',
        imageUrl: '/api/cards/dm26ex2-001/image',
      },
      currentPrice: '3480',
      pricePoints: [],
    };

    const act = () => v.parse(priceHistoryResponseSchema, response);

    expect(act).toThrow();
  });

  it('追加ワードに空白を含む時、保存できないこと', () => {
    const input = {
      additionalKeywords: ['シークレット 金', '', ''],
      cardExcludeKeywords: ['', '', ''],
    };

    const act = () => v.parse(cardWatchFormSchema, input);

    expect(act).toThrow();
  });
});
