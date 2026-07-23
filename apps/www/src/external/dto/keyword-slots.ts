import * as v from 'valibot';
import { normalizeKeywords } from '@/external/service/search-condition/normalize-keywords';

export const keywordSlotsSchema = v.pipe(
  v.array(
    v.pipe(
      v.string(),
      v.maxLength(50),
      v.regex(/^[^\s\u3000]*$/u, '1枠には1単語だけ入力してください'),
    ),
  ),
  v.maxLength(3),
  v.transform((keywords) => normalizeKeywords(keywords)),
);
