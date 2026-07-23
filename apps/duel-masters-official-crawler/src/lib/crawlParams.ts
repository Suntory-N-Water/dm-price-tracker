import * as v from 'valibot';

export const crawlParamsSchema = v.object({
  productCode: v.pipe(
    v.string(),
    v.regex(
      /^[a-z0-9]{2,32}$/,
      'productCode は2〜32文字の半角英小文字・数字で指定してください',
    ),
  ),
});

export type CrawlParams = v.InferOutput<typeof crawlParamsSchema>;
