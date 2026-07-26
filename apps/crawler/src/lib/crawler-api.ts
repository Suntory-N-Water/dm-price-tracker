import * as v from 'valibot';

const crawlerApiEnvironmentSchema = v.object({
  CRAWLER_API_BASE_URL: v.pipe(v.string(), v.url()),
  CRAWLER_API_KEY: v.pipe(v.string(), v.nonEmpty()),
  CRAWL_RUN_ID: v.pipe(v.string(), v.uuid()),
});

const mercariRunSchema = v.object({
  kind: v.literal('MERCARI'),
  targets: v.array(
    v.object({
      searchConditionId: v.string(),
      cardName: v.string(),
      additionalKeyword: v.string(),
      excludeKeyword: v.string(),
    }),
  ),
});

const officialProductsRunSchema = v.object({
  kind: v.literal('OFFICIAL_PRODUCTS'),
  targets: v.array(v.object({ targetId: v.string() })),
});

const officialCardIdsRunSchema = v.object({
  kind: v.literal('OFFICIAL_CARD_IDS'),
  targets: v.array(v.object({ targetId: v.string() })),
});

const officialCardDetailsRunSchema = v.object({
  kind: v.literal('OFFICIAL_CARD_DETAILS'),
  targets: v.array(v.object({ cardId: v.string() })),
});

const crawlRunSchema = v.variant('kind', [
  mercariRunSchema,
  officialProductsRunSchema,
  officialCardIdsRunSchema,
  officialCardDetailsRunSchema,
]);

export type CrawlRun = v.InferOutput<typeof crawlRunSchema>;

export async function getCrawlRun(): Promise<CrawlRun> {
  const environment = v.parse(crawlerApiEnvironmentSchema, process.env);
  const response = await fetch(
    `${environment.CRAWLER_API_BASE_URL}/api/crawler/runs/${environment.CRAWL_RUN_ID}`,
    {
      headers: {
        Authorization: `Bearer ${environment.CRAWLER_API_KEY}`,
      },
    },
  );
  if (!response.ok) {
    throw new Error(`クロール対象の取得に失敗しました: ${response.status}`);
  }

  return v.parse(crawlRunSchema, await response.json());
}

export async function sendCrawlResult(result: unknown): Promise<void> {
  const environment = v.parse(crawlerApiEnvironmentSchema, process.env);
  const response = await fetch(
    `${environment.CRAWLER_API_BASE_URL}/api/crawler/runs/${environment.CRAWL_RUN_ID}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${environment.CRAWLER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(result),
    },
  );
  if (!response.ok) {
    throw new Error(`クロール結果の保存に失敗しました: ${response.status}`);
  }
}

export function createTargetBatches(targetIds: readonly string[]): string[][] {
  const batches: string[][] = [];
  for (
    let offset = 0;
    offset < Math.min(targetIds.length, 2560);
    offset += 10
  ) {
    batches.push(targetIds.slice(offset, offset + 10));
  }
  return batches;
}

export function readTargetIds(): string[] | undefined {
  if (process.env['TARGET_IDS'] === undefined) {
    return;
  }
  return v.parse(
    v.array(v.pipe(v.string(), v.nonEmpty())),
    JSON.parse(process.env['TARGET_IDS']),
  );
}
