import {
  bindParameterLimit,
  crawlRuns,
  crawlTargets,
  createDisplayDatabase,
  pendingCards,
  products,
} from '@dm-price-tracker/display-db';
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  sql,
} from 'drizzle-orm';

export type CrawlStatus =
  | 'RUNNING'
  | 'COMPLETED'
  | 'PARTIALLY_FAILED'
  | 'FAILED';

export type CrawlSummary = {
  status: CrawlStatus;
  updatedAt: string;
  error: string | null;
};

export async function findAdminCrawlerStatus(database: D1Database): Promise<{
  products: {
    code: string;
    name: string;
    cardIdCrawl: CrawlSummary;
    cardDetailsCrawl: CrawlSummary | null;
    pendingCardCount: number;
  }[];
  mercariCrawl: CrawlSummary | null;
  officialProductsCrawl: CrawlSummary | null;
}> {
  const db = createDisplayDatabase(database);
  const rankedRuns = db
    .select({
      id: crawlRuns.id,
      kind: crawlRuns.kind,
      productCode: crawlRuns.productCode,
      status: crawlRuns.status,
      updatedAt: crawlRuns.updatedAt,
      position: sql<number>`ROW_NUMBER() OVER (
          PARTITION BY ${crawlRuns.kind}, ${crawlRuns.productCode}
          ORDER BY ${crawlRuns.createdAt} DESC
        )`.as('position'),
    })
    .from(crawlRuns)
    .where(
      inArray(crawlRuns.kind, [
        'MERCARI',
        'OFFICIAL_PRODUCTS',
        'OFFICIAL_CARD_IDS',
        'OFFICIAL_CARD_DETAILS',
      ]),
    )
    .as('ranked_runs');
  const [latestRuns, productRows] = await Promise.all([
    db.select().from(rankedRuns).where(eq(rankedRuns.position, 1)),
    db
      .select({
        code: products.code,
        name: products.name,
        pendingCardCount: count(pendingCards.id),
      })
      .from(products)
      .leftJoin(pendingCards, eq(pendingCards.productId, products.code))
      .groupBy(products.code, products.name, products.displayOrder)
      .orderBy(asc(products.displayOrder), asc(products.code)),
  ]);

  const latestRunIds = latestRuns.map(({ id }) => id);
  const errorByRunId = new Map<string, string>();
  for (
    let offset = 0;
    offset < latestRunIds.length;
    offset += bindParameterLimit
  ) {
    const targetErrors = await db
      .select({
        crawlRunId: crawlTargets.crawlRunId,
        error: crawlTargets.error,
      })
      .from(crawlTargets)
      .where(
        and(
          inArray(
            crawlTargets.crawlRunId,
            latestRunIds.slice(offset, offset + bindParameterLimit),
          ),
          isNotNull(crawlTargets.error),
        ),
      )
      .orderBy(desc(crawlTargets.updatedAt));
    for (const target of targetErrors) {
      if (target.error !== null && !errorByRunId.has(target.crawlRunId)) {
        errorByRunId.set(target.crawlRunId, target.error);
      }
    }
  }

  const cardIdRunByProduct = new Map<string, (typeof latestRuns)[number]>();
  const cardDetailsRunByProduct = new Map<
    string,
    (typeof latestRuns)[number]
  >();
  for (const run of latestRuns) {
    if (run.productCode === null) {
      continue;
    }
    if (run.kind === 'OFFICIAL_CARD_IDS') {
      cardIdRunByProduct.set(run.productCode, run);
    } else if (run.kind === 'OFFICIAL_CARD_DETAILS') {
      cardDetailsRunByProduct.set(run.productCode, run);
    }
  }

  const productStatuses: {
    code: string;
    name: string;
    cardIdCrawl: CrawlSummary;
    cardDetailsCrawl: CrawlSummary | null;
    pendingCardCount: number;
  }[] = [];
  for (const product of productRows) {
    const cardIdRun = cardIdRunByProduct.get(product.code);
    if (cardIdRun === undefined) {
      continue;
    }
    const cardDetailsRun = cardDetailsRunByProduct.get(product.code);
    productStatuses.push({
      code: product.code,
      name: product.name,
      cardIdCrawl: {
        status: cardIdRun.status as CrawlStatus,
        updatedAt: cardIdRun.updatedAt,
        error: errorByRunId.get(cardIdRun.id) ?? null,
      },
      cardDetailsCrawl:
        cardDetailsRun === undefined
          ? null
          : {
              status: cardDetailsRun.status as CrawlStatus,
              updatedAt: cardDetailsRun.updatedAt,
              error: errorByRunId.get(cardDetailsRun.id) ?? null,
            },
      pendingCardCount: product.pendingCardCount,
    });
  }

  const mercari = latestRuns.find(({ kind }) => kind === 'MERCARI');
  const officialProducts = latestRuns.find(
    ({ kind }) => kind === 'OFFICIAL_PRODUCTS',
  );

  return {
    products: productStatuses,
    mercariCrawl:
      mercari === undefined
        ? null
        : {
            status: mercari.status as CrawlStatus,
            updatedAt: mercari.updatedAt,
            error: errorByRunId.get(mercari.id) ?? null,
          },
    officialProductsCrawl:
      officialProducts === undefined
        ? null
        : {
            status: officialProducts.status as CrawlStatus,
            updatedAt: officialProducts.updatedAt,
            error: errorByRunId.get(officialProducts.id) ?? null,
          },
  };
}
