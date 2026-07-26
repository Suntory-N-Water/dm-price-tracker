import * as v from 'valibot';

const productSchema = v.object({
  code: v.string(),
  name: v.string(),
});

const cardSchema = v.object({
  id: v.string(),
  name: v.string(),
  imageUrl: v.string(),
  product: productSchema,
  isWatching: v.boolean(),
});

export const cardListResponseSchema = v.object({
  cards: v.array(cardSchema),
});

export const productListResponseSchema = v.object({
  products: v.array(productSchema),
});

const keywordArraySchema = v.pipe(v.array(v.string()), v.maxLength(3));

export const cardWatchSchema = v.object({
  card: v.object({
    id: v.string(),
    name: v.string(),
    imageUrl: v.string(),
    product: productSchema,
  }),
  additionalKeywords: keywordArraySchema,
  commonExcludeKeywords: keywordArraySchema,
  cardExcludeKeywords: keywordArraySchema,
  currentPrice: v.nullable(v.number()),
  crawledAt: v.nullable(v.string()),
});

export const cardWatchListResponseSchema = v.object({
  watches: v.array(cardWatchSchema),
});

export const priceHistoryResponseSchema = v.object({
  card: v.object({
    id: v.string(),
    name: v.string(),
    imageUrl: v.string(),
  }),
  currentPrice: v.nullable(v.number()),
  pricePoints: v.array(
    v.object({
      crawledAt: v.string(),
      price: v.number(),
      screenshotUrl: v.nullable(v.string()),
    }),
  ),
});

export const settingsResponseSchema = v.object({
  keywords: keywordArraySchema,
});

export const updateSettingsResponseSchema = v.object({
  keywords: keywordArraySchema,
  updatedCardCount: v.number(),
});

export const cardWatchSettingsResponseSchema = v.object({
  cardId: v.string(),
  additionalKeywords: keywordArraySchema,
  commonExcludeKeywords: keywordArraySchema,
  cardExcludeKeywords: keywordArraySchema,
});

export const bulkExcludeResponseSchema = v.object({
  updated: v.array(v.object({ cardId: v.string() })),
  skipped: v.array(
    v.object({
      cardId: v.string(),
      reason: v.string(),
    }),
  ),
});

export const crawlProductResponseSchema = v.object({
  id: v.string(),
  status: v.literal('RUNNING'),
});

const crawlSummarySchema = v.object({
  status: v.picklist(['RUNNING', 'COMPLETED', 'PARTIALLY_FAILED', 'FAILED']),
  updatedAt: v.string(),
  error: v.nullable(v.string()),
});

export const adminProductListResponseSchema = v.object({
  products: v.array(
    v.object({
      code: v.string(),
      name: v.string(),
      cardIdCrawl: crawlSummarySchema,
      cardDetailsCrawl: v.nullable(crawlSummarySchema),
      pendingCardCount: v.number(),
    }),
  ),
  mercariCrawl: v.nullable(crawlSummarySchema),
  officialProductsCrawl: v.nullable(crawlSummarySchema),
});

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

export const commonExcludeFormSchema = v.strictObject({
  keywords: formSlotsSchema,
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

export type Card = v.InferOutput<typeof cardSchema>;
export type Product = v.InferOutput<typeof productSchema>;
export type CardWatch = v.InferOutput<typeof cardWatchSchema>;
export type PriceHistory = v.InferOutput<typeof priceHistoryResponseSchema>;
export type AdminProduct = v.InferOutput<
  typeof adminProductListResponseSchema
>['products'][number];
export type CrawlSummary = v.InferOutput<typeof crawlSummarySchema>;
