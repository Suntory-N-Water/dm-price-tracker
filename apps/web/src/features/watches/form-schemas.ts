import * as v from 'valibot';

const formWordSchema = v.pipe(
  v.string(),
  v.trim(),
  v.maxLength(50),
  v.regex(/^[^\s\u3000]*$/u, '1枠には1単語を入力してください'),
);

const formSlotsSchema = v.pipe(v.array(formWordSchema), v.length(3));

export const cardWatchFormSchema = v.strictObject({
  additionalKeywords: formSlotsSchema,
  cardExcludeKeywords: formSlotsSchema,
});

export const bulkExcludeFormSchema = v.strictObject({
  cardIds: v.pipe(v.array(v.string()), v.minLength(1), v.maxLength(100)),
  excludeKeyword: v.pipe(
    v.string(),
    v.trim(),
    v.nonEmpty('除外ワードを入力してください'),
    v.maxLength(50),
    v.regex(/^[^\s\u3000]+$/u, '1単語で入力してください'),
  ),
});
