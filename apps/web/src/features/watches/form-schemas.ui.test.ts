import { describe, expect, it } from 'vitest';
import * as v from 'valibot';
import { cardWatchFormSchema } from './form-schemas';

describe('価格チェック設定', () => {
  it('追加ワードに空白を含む時、保存できないこと', () => {
    const input = {
      additionalKeywords: ['シークレット 金', '', ''],
      cardExcludeKeywords: ['', '', ''],
    };

    const act = () => v.parse(cardWatchFormSchema, input);

    expect(act).toThrow();
  });
});
