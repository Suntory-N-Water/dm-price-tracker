import {
  bindParameterLimit,
  cardWatches,
  cards,
  crawlRuns,
  crawlTargets,
  createDisplayDatabase,
  pendingCards,
  priceSeries,
  searchConditions,
} from '@dm-price-tracker/display-db';
import { and, desc, eq, exists, inArray, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import {
  dispatchCrawlerWorkflow,
  type CrawlerEventType,
} from '@/external/client/github-client';

export type CrawlKind =
  | 'MERCARI'
  | 'OFFICIAL_PRODUCTS'
  | 'OFFICIAL_CARD_IDS'
  | 'OFFICIAL_CARD_DETAILS';

export class CrawlAlreadyRunningError extends Error {}
export class NoCrawlTargetsError extends Error {}

const eventTypeByKind: Record<CrawlKind, CrawlerEventType> = {
  MERCARI: 'crawl-mercari',
  OFFICIAL_PRODUCTS: 'crawl-official-products',
  OFFICIAL_CARD_IDS: 'crawl-official-card-ids',
  OFFICIAL_CARD_DETAILS: 'crawl-official-card-details',
};

async function createCrawlRun(
  env: CloudflareEnv,
  {
    kind,
    productCode,
    targetIds,
    expiresInMilliseconds,
    retryFailedTargets,
  }: {
    kind: CrawlKind;
    productCode?: string;
    targetIds: readonly string[];
    expiresInMilliseconds: number;
    retryFailedTargets: boolean;
  },
): Promise<{ id: string; status: 'RUNNING' }> {
  const db = createDisplayDatabase(env.DISPLAY_DB);
  const productCondition =
    productCode === undefined
      ? sql`${crawlRuns.productCode} is null`
      : eq(crawlRuns.productCode, productCode);
  const [running] = await db
    .select({ id: crawlRuns.id })
    .from(crawlRuns)
    .where(
      and(
        eq(crawlRuns.kind, kind),
        productCondition,
        eq(crawlRuns.status, 'RUNNING'),
      ),
    )
    .limit(1);
  if (running !== undefined) {
    throw new CrawlAlreadyRunningError('同じクロールが実行中です');
  }

  let retriedFromRunId: string | undefined;
  let fixedTargetIds = [...targetIds];
  if (retryFailedTargets) {
    const [latestFailedRun] = await db
      .select({ id: crawlRuns.id })
      .from(crawlRuns)
      .where(
        and(
          eq(crawlRuns.kind, kind),
          productCondition,
          inArray(crawlRuns.status, ['PARTIALLY_FAILED', 'FAILED']),
        ),
      )
      .orderBy(desc(crawlRuns.createdAt))
      .limit(1);
    if (latestFailedRun !== undefined) {
      const failedTargets = await db
        .select({ targetId: crawlTargets.targetId })
        .from(crawlTargets)
        .where(
          and(
            eq(crawlTargets.crawlRunId, latestFailedRun.id),
            eq(crawlTargets.status, 'FAILED'),
          ),
        );
      if (failedTargets.length > 0) {
        retriedFromRunId = latestFailedRun.id;
        fixedTargetIds = failedTargets.map(({ targetId }) => targetId);
      }
    }
  }
  if (fixedTargetIds.length === 0) {
    throw new NoCrawlTargetsError('クロール対象がありません');
  }

  const id = crypto.randomUUID();
  const targetValues = fixedTargetIds.map((targetId) => ({
    crawlRunId: id,
    targetId,
    status: 'PENDING',
  }));
  const targetsPerStatement = Math.floor(bindParameterLimit / 3);
  const statements: BatchItem<'sqlite'>[] = [
    db.insert(crawlRuns).values({
      id,
      kind,
      productCode,
      status: 'RUNNING',
      retriedFromRunId,
      expiresAt: new Date(Date.now() + expiresInMilliseconds)
        .toISOString()
        .replace('T', ' ')
        .replace(/\.\d{3}Z$/u, ''),
    }),
  ];
  for (
    let offset = 0;
    offset < targetValues.length;
    offset += targetsPerStatement
  ) {
    statements.push(
      db
        .insert(crawlTargets)
        .values(targetValues.slice(offset, offset + targetsPerStatement)),
    );
  }
  await db.batch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
  await dispatchCrawlerWorkflow({
    repository: env.GITHUB_REPOSITORY,
    token: env.GITHUB_DISPATCH_TOKEN,
    eventType: eventTypeByKind[kind],
    crawlRunId: id,
  });

  return { id, status: 'RUNNING' };
}

export async function startMercariCrawl(
  env: CloudflareEnv,
): Promise<{ id: string; status: 'RUNNING' }> {
  const db = createDisplayDatabase(env.DISPLAY_DB);
  const conditions = await db
    .selectDistinct({ id: searchConditions.id })
    .from(searchConditions)
    .innerJoin(priceSeries, eq(priceSeries.id, searchConditions.priceSeriesId))
    .innerJoin(cards, eq(cards.id, priceSeries.cardId))
    .where(
      exists(
        db
          .select({ one: sql`1` })
          .from(cardWatches)
          .where(
            sql`${cardWatches.searchConditionId} = ${searchConditions.id} and ${cardWatches.isCurrent} = 1`,
          ),
      ),
    );

  return await createCrawlRun(env, {
    kind: 'MERCARI',
    targetIds: conditions.map(({ id }) => String(id)),
    expiresInMilliseconds: 25 * 60 * 1000,
    retryFailedTargets: false,
  });
}

export async function startOfficialProductsCrawl(
  env: CloudflareEnv,
): Promise<{ id: string; status: 'RUNNING' }> {
  return await createCrawlRun(env, {
    kind: 'OFFICIAL_PRODUCTS',
    targetIds: ['products'],
    expiresInMilliseconds: 60 * 60 * 1000,
    retryFailedTargets: true,
  });
}

export async function startOfficialCardIdsCrawl(
  env: CloudflareEnv,
  productCode: string,
): Promise<{ id: string; status: 'RUNNING' }> {
  return await createCrawlRun(env, {
    kind: 'OFFICIAL_CARD_IDS',
    productCode,
    targetIds: [productCode],
    expiresInMilliseconds: 60 * 60 * 1000,
    retryFailedTargets: true,
  });
}

export async function startOfficialCardDetailsCrawl(
  env: CloudflareEnv,
  productCode: string,
): Promise<{ id: string; status: 'RUNNING' }> {
  const db = createDisplayDatabase(env.DISPLAY_DB);
  const targets = await db
    .select({ id: pendingCards.id })
    .from(pendingCards)
    .where(eq(pendingCards.productId, productCode));

  return await createCrawlRun(env, {
    kind: 'OFFICIAL_CARD_DETAILS',
    productCode,
    targetIds: targets.map(({ id }) => id),
    expiresInMilliseconds: Math.min(
      targets.length * 30 * 1000 + 30 * 60 * 1000,
      6 * 60 * 60 * 1000,
    ),
    retryFailedTargets: true,
  });
}
