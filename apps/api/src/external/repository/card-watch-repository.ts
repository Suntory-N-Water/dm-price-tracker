import { and, asc, eq, gt, inArray, notExists, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import {
  cards,
  cardWatches,
  createDisplayDatabase,
  pricePoints,
  priceSeries,
  products,
  screenshots,
  searchConditions,
} from '@dm-price-tracker/display-db';

export type CardWatchSettings = {
  cardId: string;
  additionalKeywords: string[];
  commonExcludeKeywords: string[];
  cardExcludeKeywords: string[];
};

type StartCardWatchInput = {
  database: D1Database;
  userEmail: string;
  cardId: string;
  commonExcludeKeywords: readonly string[];
};

export async function startCardWatch({
  database,
  userEmail,
  cardId,
  commonExcludeKeywords,
}: StartCardWatchInput): Promise<CardWatchSettings | undefined> {
  const db = createDisplayDatabase(database);
  const [card] = await db
    .select({ id: cards.id })
    .from(cards)
    .where(eq(cards.id, cardId))
    .limit(1);
  if (card === undefined) {
    return;
  }

  const normalizedExcludeKeyword = commonExcludeKeywords.join(' ');
  await db
    .insert(priceSeries)
    .values({ cardId, normalizedAdditionalKeyword: '' })
    .onConflictDoNothing();
  const [series] = await db
    .select({ id: priceSeries.id })
    .from(priceSeries)
    .where(
      and(
        eq(priceSeries.cardId, cardId),
        eq(priceSeries.normalizedAdditionalKeyword, ''),
      ),
    );
  if (series === undefined) {
    return;
  }
  await db
    .insert(searchConditions)
    .values({
      priceSeriesId: series.id,
      normalizedExcludeKeyword,
    })
    .onConflictDoNothing();
  const [condition] = await db
    .select({ id: searchConditions.id })
    .from(searchConditions)
    .where(
      and(
        eq(searchConditions.priceSeriesId, series.id),
        eq(searchConditions.normalizedExcludeKeyword, normalizedExcludeKeyword),
      ),
    );
  if (condition === undefined) {
    return;
  }
  await db
    .insert(cardWatches)
    .values({
      userEmail,
      cardId,
      searchConditionId: condition.id,
      isCurrent: 1,
    })
    .onConflictDoNothing();

  return {
    cardId,
    additionalKeywords: [],
    commonExcludeKeywords: [...commonExcludeKeywords],
    cardExcludeKeywords: [],
  };
}

type ChangeCardWatchInput = {
  database: D1Database;
  userEmail: string;
  cardId: string;
  additionalKeywords: readonly string[];
  commonExcludeKeywords: readonly string[];
  cardExcludeKeywords: readonly string[];
};

export async function changeCardWatch({
  database,
  userEmail,
  cardId,
  additionalKeywords,
  commonExcludeKeywords,
  cardExcludeKeywords,
}: ChangeCardWatchInput): Promise<CardWatchSettings | undefined> {
  const db = createDisplayDatabase(database);
  const [currentWatch] = await db
    .select({ id: cardWatches.id })
    .from(cardWatches)
    .where(
      and(
        eq(cardWatches.userEmail, userEmail),
        eq(cardWatches.cardId, cardId),
        eq(cardWatches.isCurrent, 1),
      ),
    )
    .limit(1);
  if (currentWatch === undefined) {
    return;
  }

  const normalizedAdditionalKeyword = additionalKeywords.join(' ');
  const normalizedExcludeKeyword = [
    ...new Set([...commonExcludeKeywords, ...cardExcludeKeywords]),
  ]
    .sort()
    .join(' ');

  await db
    .insert(priceSeries)
    .values({ cardId, normalizedAdditionalKeyword })
    .onConflictDoNothing();
  const [series] = await db
    .select({ id: priceSeries.id })
    .from(priceSeries)
    .where(
      and(
        eq(priceSeries.cardId, cardId),
        eq(
          priceSeries.normalizedAdditionalKeyword,
          normalizedAdditionalKeyword,
        ),
      ),
    );
  if (series === undefined) {
    return;
  }
  await db
    .insert(searchConditions)
    .values({
      priceSeriesId: series.id,
      normalizedExcludeKeyword,
    })
    .onConflictDoNothing();
  const [condition] = await db
    .select({ id: searchConditions.id })
    .from(searchConditions)
    .where(
      and(
        eq(searchConditions.priceSeriesId, series.id),
        eq(searchConditions.normalizedExcludeKeyword, normalizedExcludeKeyword),
      ),
    );
  if (condition === undefined) {
    return;
  }

  await db.batch([
    db
      .update(cardWatches)
      .set({ isCurrent: 0 })
      .where(
        and(
          eq(cardWatches.userEmail, userEmail),
          eq(cardWatches.cardId, cardId),
          eq(cardWatches.isCurrent, 1),
        ),
      ),
    db.insert(cardWatches).values({
      userEmail,
      cardId,
      searchConditionId: condition.id,
      isCurrent: 1,
    }),
  ]);

  return {
    cardId,
    additionalKeywords: [...additionalKeywords],
    commonExcludeKeywords: [...commonExcludeKeywords],
    cardExcludeKeywords: [...cardExcludeKeywords],
  };
}

export async function stopCardWatch(
  database: D1Database,
  userEmail: string,
  cardId: string,
): Promise<boolean> {
  const stopped = await createDisplayDatabase(database)
    .update(cardWatches)
    .set({ isCurrent: 0 })
    .where(
      and(
        eq(cardWatches.userEmail, userEmail),
        eq(cardWatches.cardId, cardId),
        eq(cardWatches.isCurrent, 1),
      ),
    )
    .returning({ id: cardWatches.id });

  return stopped.length > 0;
}

export type PriceHistory = {
  card: {
    id: string;
    name: string;
    imageUrl: string;
  };
  currentPrice: number | null;
  pricePoints: {
    crawledAt: string;
    price: number;
    screenshotUrl: string | null;
  }[];
};

export async function findPriceHistory(
  database: D1Database,
  userEmail: string,
  cardId: string,
): Promise<PriceHistory | undefined> {
  const db = createDisplayDatabase(database);
  const [current] = await db
    .select({
      id: cards.id,
      name: cards.name,
      priceSeriesId: searchConditions.priceSeriesId,
    })
    .from(cardWatches)
    .innerJoin(cards, eq(cards.id, cardWatches.cardId))
    .innerJoin(
      searchConditions,
      eq(searchConditions.id, cardWatches.searchConditionId),
    )
    .where(
      and(
        eq(cardWatches.userEmail, userEmail),
        eq(cardWatches.cardId, cardId),
        eq(cardWatches.isCurrent, 1),
      ),
    )
    .limit(1);
  if (current === undefined) {
    return;
  }

  const usedConditions = db
    .selectDistinct({ searchConditionId: cardWatches.searchConditionId })
    .from(cardWatches)
    .innerJoin(
      searchConditions,
      eq(searchConditions.id, cardWatches.searchConditionId),
    )
    .where(
      and(
        eq(cardWatches.userEmail, userEmail),
        eq(cardWatches.cardId, cardId),
        eq(searchConditions.priceSeriesId, current.priceSeriesId),
      ),
    )
    .as('used_conditions');
  const rows = await db
    .select({
      crawledAt: pricePoints.crawledAt,
      price: pricePoints.price,
      imageKey: screenshots.imageKey,
    })
    .from(pricePoints)
    .innerJoin(
      usedConditions,
      eq(usedConditions.searchConditionId, pricePoints.searchConditionId),
    )
    .leftJoin(
      screenshots,
      and(
        eq(screenshots.searchConditionId, pricePoints.searchConditionId),
        eq(screenshots.crawledAt, pricePoints.crawledAt),
      ),
    )
    .orderBy(asc(pricePoints.crawledAt));
  const historyPoints = rows.map((point) => ({
    crawledAt: point.crawledAt,
    price: point.price,
    screenshotUrl:
      point.imageKey === null
        ? null
        : `/api/card-watches/${encodeURIComponent(cardId)}/screenshots/${encodeURIComponent(point.crawledAt)}`,
  }));

  return {
    card: {
      id: current.id,
      name: current.name,
      imageUrl: `/api/cards/${encodeURIComponent(current.id)}/image`,
    },
    currentPrice: historyPoints.at(-1)?.price ?? null,
    pricePoints: historyPoints,
  };
}

export type CardWatchSummary = {
  card: {
    id: string;
    name: string;
    imageUrl: string;
    product: {
      code: string;
      name: string;
    };
  };
  additionalKeywords: string[];
  commonExcludeKeywords: string[];
  cardExcludeKeywords: string[];
  currentPrice: number | null;
  crawledAt: string | null;
};

type FindCurrentCardWatchesInput = {
  database: D1Database;
  userEmail: string;
  commonExcludeKeywords: readonly string[];
  filters: { name?: string; productCode?: string };
};

export async function findCurrentCardWatches({
  database,
  userEmail,
  commonExcludeKeywords,
  filters,
}: FindCurrentCardWatchesInput): Promise<CardWatchSummary[]> {
  const db = createDisplayDatabase(database);
  const latestPoint = alias(pricePoints, 'latest_price_point');
  const newerPoint = alias(pricePoints, 'newer_price_point');
  const conditions = [
    eq(cardWatches.userEmail, userEmail),
    eq(cardWatches.isCurrent, 1),
  ];
  if (filters.name !== undefined && filters.name !== '') {
    const pattern = `%${filters.name.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
    conditions.push(sql`${cards.name} LIKE ${pattern} ESCAPE '\\'`);
  }
  if (filters.productCode !== undefined && filters.productCode !== '') {
    conditions.push(eq(cards.productId, filters.productCode));
  }

  const rows = await db
    .select({
      id: cards.id,
      name: cards.name,
      productCode: products.code,
      productName: products.name,
      normalizedAdditionalKeyword: priceSeries.normalizedAdditionalKeyword,
      normalizedExcludeKeyword: searchConditions.normalizedExcludeKeyword,
      currentPrice: latestPoint.price,
      crawledAt: latestPoint.crawledAt,
    })
    .from(cardWatches)
    .innerJoin(cards, eq(cards.id, cardWatches.cardId))
    .innerJoin(products, eq(products.code, cards.productId))
    .innerJoin(
      searchConditions,
      eq(searchConditions.id, cardWatches.searchConditionId),
    )
    .innerJoin(priceSeries, eq(priceSeries.id, searchConditions.priceSeriesId))
    .leftJoin(
      latestPoint,
      and(
        eq(latestPoint.searchConditionId, cardWatches.searchConditionId),
        notExists(
          db
            .select({ one: sql`1` })
            .from(newerPoint)
            .where(
              and(
                eq(newerPoint.searchConditionId, latestPoint.searchConditionId),
                gt(newerPoint.crawledAt, latestPoint.crawledAt),
              ),
            ),
        ),
      ),
    )
    .where(and(...conditions))
    .orderBy(asc(cards.id));

  return rows.map((watch) => ({
    card: {
      id: watch.id,
      name: watch.name,
      imageUrl: `/api/cards/${encodeURIComponent(watch.id)}/image`,
      product: {
        code: watch.productCode,
        name: watch.productName,
      },
    },
    additionalKeywords:
      watch.normalizedAdditionalKeyword === ''
        ? []
        : watch.normalizedAdditionalKeyword.split(' '),
    commonExcludeKeywords: [...commonExcludeKeywords],
    cardExcludeKeywords:
      watch.normalizedExcludeKeyword === ''
        ? []
        : watch.normalizedExcludeKeyword
            .split(' ')
            .filter((keyword) => !commonExcludeKeywords.includes(keyword)),
    currentPrice: watch.currentPrice,
    crawledAt: watch.crawledAt,
  }));
}

type FindScreenshotImageKeyInput = {
  database: D1Database;
  userEmail: string;
  cardId: string;
  crawledAt: string;
};

export async function findScreenshotImageKey({
  database,
  userEmail,
  cardId,
  crawledAt,
}: FindScreenshotImageKeyInput): Promise<string | undefined> {
  const db = createDisplayDatabase(database);
  const currentWatch = alias(cardWatches, 'current_watch');
  const currentCondition = alias(searchConditions, 'current_condition');
  const historicalWatch = alias(cardWatches, 'historical_watch');
  const currentSeriesIds = db
    .select({ priceSeriesId: currentCondition.priceSeriesId })
    .from(currentWatch)
    .innerJoin(
      currentCondition,
      eq(currentCondition.id, currentWatch.searchConditionId),
    )
    .where(
      and(
        eq(currentWatch.userEmail, userEmail),
        eq(currentWatch.cardId, cardId),
        eq(currentWatch.isCurrent, 1),
      ),
    );
  const historicalConditionIds = db
    .select({ searchConditionId: historicalWatch.searchConditionId })
    .from(historicalWatch)
    .where(
      and(
        eq(historicalWatch.userEmail, userEmail),
        eq(historicalWatch.cardId, cardId),
      ),
    );

  const [screenshot] = await db
    .select({ imageKey: screenshots.imageKey })
    .from(screenshots)
    .innerJoin(
      searchConditions,
      eq(searchConditions.id, screenshots.searchConditionId),
    )
    .where(
      and(
        eq(screenshots.crawledAt, crawledAt),
        inArray(searchConditions.priceSeriesId, currentSeriesIds),
        inArray(screenshots.searchConditionId, historicalConditionIds),
      ),
    )
    .limit(1);

  return screenshot?.imageKey;
}
