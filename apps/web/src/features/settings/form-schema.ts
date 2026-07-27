import * as v from 'valibot';

const formWordSchema = v.pipe(
  v.string(),
  v.trim(),
  v.maxLength(50),
  v.regex(/^[^\s\u3000]*$/u, '1枠には1単語を入力してください'),
);

export const commonExcludeFormSchema = v.strictObject({
  keywords: v.pipe(v.array(formWordSchema), v.length(3)),
});
