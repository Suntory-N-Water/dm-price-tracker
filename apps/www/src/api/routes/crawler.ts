import { sValidator } from '@hono/standard-validator';
import {
  bindParameterLimit,
  cards,
  crawlRuns,
  crawlTargets,
  createDisplayDatabase,
  pendingCards,
  pricePoints,
  priceSeries,
  products,
  searchConditions,
  screenshots,
  type DisplayDatabase,
} from '@dm-price-tracker/display-db';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import * as v from 'valibot';
import type { ApiEnv } from '../types';
import { calculateMedianUnitPrice } from '@/external/service/price/priceAggregation';

const crawlRunParamsSchema = v.object({
  crawlRunId: v.pipe(v.string(), v.uuid()),
});

const resultSchema = v.union([
  v.object({
    targetId: v.pipe(v.string(), v.nonEmpty(), v.maxLength(100)),
    success: v.literal(false),
    error: v.pipe(v.string(), v.nonEmpty(), v.maxLength(4000)),
  }),
  v.object({
    targetId: v.pipe(v.string(), v.nonEmpty(), v.maxLength(100)),
    success: v.literal(true),
    data: v.unknown(),
  }),
]);

const mercariDataSchema = v.object({
  imageKey: v.pipe(v.string(), v.nonEmpty(), v.maxLength(500)),
  items: v.array(
    v.object({
      title: v.pipe(v.string(), v.nonEmpty(), v.maxLength(500)),
      price: v.pipe(v.number(), v.integer(), v.minValue(0)),
    }),
  ),
});

const officialProductsDataSchema = v.object({
  products: v.array(
    v.object({
      code: v.pipe(v.string(), v.nonEmpty(), v.maxLength(30)),
      name: v.pipe(v.string(), v.nonEmpty(), v.maxLength(200)),
      displayOrder: v.pipe(v.number(), v.integer(), v.minValue(0)),
    }),
  ),
});

const officialCardIdsDataSchema = v.object({
  cardIds: v.array(v.pipe(v.string(), v.nonEmpty(), v.maxLength(100))),
});

const officialCardDetailsDataSchema = v.object({
  cardId: v.pipe(v.string(), v.nonEmpty(), v.maxLength(100)),
  name: v.pipe(v.string(), v.nonEmpty(), v.maxLength(200)),
  imageKey: v.pipe(v.string(), v.nonEmpty(), v.maxLength(500)),
});

const failureSchema = v.object({
  error: v.pipe(v.string(), v.nonEmpty(), v.maxLength(4000)),
});

function buildCrawlRunStatusUpdate(
  db: DisplayDatabase,
  crawlRunId: string,
): BatchItem<'sqlite'> {
  return db
    .update(crawlRuns)
    .set({
      status: sql`CASE
        WHEN (
          SELECT COUNT(*)
          FROM crawl_targets
          WHERE crawl_run_id = ${crawlRunId}
            AND status = 'PENDING'
        ) = 0
        THEN CASE
          WHEN (
            SELECT COUNT(*)
            FROM crawl_targets
            WHERE crawl_run_id = ${crawlRunId}
              AND status = 'FAILED'
          ) = 0
          THEN 'COMPLETED'
          WHEN (
            SELECT COUNT(*)
            FROM crawl_targets
            WHERE crawl_run_id = ${crawlRunId}
              AND status = 'FAILED'
          ) = (
            SELECT COUNT(*)
            FROM crawl_targets
            WHERE crawl_run_id = ${crawlRunId}
          )
          THEN 'FAILED'
          ELSE 'PARTIALLY_FAILED'
        END
        ELSE ${crawlRuns.status}
      END`,
      updatedAt: sql`CASE
        WHEN (
          SELECT COUNT(*)
          FROM crawl_targets
          WHERE crawl_run_id = ${crawlRunId}
            AND status = 'PENDING'
        ) = 0
        THEN CURRENT_TIMESTAMP
        ELSE ${crawlRuns.updatedAt}
      END`,
    })
    .where(eq(crawlRuns.id, crawlRunId));
}

const crawlerBodyLimit = bodyLimit({
  maxSize: 1024 * 1024,
  onError: (context) =>
    context.json({ error: 'リクエストが大きすぎます' }, 413),
});

export const crawlerRoutes = new Hono<ApiEnv>()
  .use('*', async (context, next) => {
    if (
      context.req.raw.headers.has('content-length') ||
      context.req.raw.headers.has('transfer-encoding')
    ) {
      return await crawlerBodyLimit(context, next);
    }
    return await next();
  })
  .use('*', async (context, next) => {
    const authorization = context.req.header('authorization') ?? '';
    const hasBearerPrefix = authorization.startsWith('Bearer ');
    const candidate = hasBearerPrefix ? authorization.slice(7) : '';
    const encoder = new TextEncoder();
    const [candidateHash, expectedHash] = await Promise.all([
      crypto.subtle.digest('SHA-256', encoder.encode(candidate)),
      crypto.subtle.digest(
        'SHA-256',
        encoder.encode(context.env.CRAWLER_API_KEY),
      ),
    ]);
    const candidateBytes = new Uint8Array(candidateHash);
    const expectedBytes = new Uint8Array(expectedHash);
    let difference = 0;
    for (let index = 0; index < expectedBytes.length; index += 1) {
      difference |= candidateBytes[index] ^ expectedBytes[index];
    }
    if (!hasBearerPrefix || difference !== 0) {
      return context.json({ error: '認証が必要です' }, 401);
    }
    await next();
  })
  .get(
    '/runs/:crawlRunId',
    sValidator('param', crawlRunParamsSchema, (result, context) => {
      if (!result.success) {
        return context.json({ error: '入力値が不正です' }, 400);
      }
    }),
    async (context) => {
      const { crawlRunId } = context.req.valid('param');
      const [run] = await createDisplayDatabase(context.env.DISPLAY_DB)
        .select({ kind: crawlRuns.kind })
        .from(crawlRuns)
        .where(eq(crawlRuns.id, crawlRunId))
        .limit(1);
      if (run === undefined) {
        return context.json({ error: 'クロール実行が見つかりません' }, 404);
      }

      if (run.kind === 'MERCARI') {
        const targets = await createDisplayDatabase(context.env.DISPLAY_DB)
          .select({
            searchConditionId: searchConditions.id,
            cardName: cards.name,
            additionalKeyword: priceSeries.normalizedAdditionalKeyword,
            excludeKeyword: searchConditions.normalizedExcludeKeyword,
          })
          .from(crawlTargets)
          .innerJoin(
            searchConditions,
            sql`${searchConditions.id} = CAST(${crawlTargets.targetId} AS INTEGER)`,
          )
          .innerJoin(
            priceSeries,
            eq(priceSeries.id, searchConditions.priceSeriesId),
          )
          .innerJoin(cards, eq(cards.id, priceSeries.cardId))
          .where(
            and(
              eq(crawlTargets.crawlRunId, crawlRunId),
              ne(crawlTargets.status, 'SUCCEEDED'),
            ),
          )
          .orderBy(searchConditions.id);
        return context.json({
          kind: run.kind,
          targets: targets.map((target) => ({
            searchConditionId: String(target.searchConditionId),
            cardName: target.cardName,
            additionalKeyword: target.additionalKeyword,
            excludeKeyword: target.excludeKeyword,
          })),
        });
      }

      const targets = await createDisplayDatabase(context.env.DISPLAY_DB)
        .select({ targetId: crawlTargets.targetId })
        .from(crawlTargets)
        .where(
          and(
            eq(crawlTargets.crawlRunId, crawlRunId),
            sql`${crawlTargets.status} != 'SUCCEEDED'`,
          ),
        );
      return context.json({
        kind: run.kind,
        targets: targets.map(({ targetId }) =>
          run.kind === 'OFFICIAL_CARD_DETAILS'
            ? { cardId: targetId }
            : { targetId },
        ),
      });
    },
  )
  .post(
    '/runs/:crawlRunId',
    sValidator('param', crawlRunParamsSchema, (result, context) => {
      if (!result.success) {
        return context.json({ error: '入力値が不正です' }, 400);
      }
    }),
    sValidator('json', resultSchema, (result, context) => {
      if (!result.success) {
        return context.json({ error: '入力値が不正です' }, 400);
      }
    }),
    async (context) => {
      const { crawlRunId } = context.req.valid('param');
      const result = context.req.valid('json');
      const db = createDisplayDatabase(context.env.DISPLAY_DB);
      const [target] = await db
        .select({
          kind: crawlRuns.kind,
          productCode: crawlRuns.productCode,
          status: crawlTargets.status,
        })
        .from(crawlTargets)
        .innerJoin(crawlRuns, eq(crawlRuns.id, crawlTargets.crawlRunId))
        .where(
          and(
            eq(crawlTargets.crawlRunId, crawlRunId),
            eq(crawlTargets.targetId, result.targetId),
          ),
        )
        .limit(1);
      if (target === undefined) {
        return context.json({ error: 'クロール対象が見つかりません' }, 404);
      }
      if (target.status === 'SUCCEEDED') {
        return context.json({ accepted: false });
      }

      const statements: BatchItem<'sqlite'>[] = [];
      if (result.success) {
        if (target.kind === 'MERCARI') {
          const parsedData = v.safeParse(mercariDataSchema, result.data);
          if (!parsedData.success) {
            return context.json({ error: '入力値が不正です' }, 400);
          }
          const data = parsedData.output;
          const crawledAt = new Date()
            .toISOString()
            .replace('T', ' ')
            .replace(/\.\d{3}Z$/u, '');
          const searchConditionId = Number.parseInt(result.targetId, 10);
          const price = calculateMedianUnitPrice(data.items);
          if (price !== undefined) {
            statements.push(
              db
                .insert(pricePoints)
                .values({ searchConditionId, crawledAt, price })
                .onConflictDoNothing(),
            );
          }
          statements.push(
            db
              .insert(screenshots)
              .values({
                searchConditionId,
                crawledAt,
                imageKey: data.imageKey,
              })
              .onConflictDoNothing(),
          );
        } else if (target.kind === 'OFFICIAL_PRODUCTS') {
          const parsedData = v.safeParse(
            officialProductsDataSchema,
            result.data,
          );
          if (!parsedData.success) {
            return context.json({ error: '入力値が不正です' }, 400);
          }
          const data = parsedData.output;
          for (let offset = 0; offset < data.products.length; offset += 20) {
            statements.push(
              db
                .insert(products)
                .values(data.products.slice(offset, offset + 20))
                .onConflictDoUpdate({
                  target: products.code,
                  set: {
                    name: sql`excluded.name`,
                    displayOrder: sql`excluded.display_order`,
                  },
                }),
            );
          }
        } else if (target.kind === 'OFFICIAL_CARD_IDS') {
          const parsedData = v.safeParse(
            officialCardIdsDataSchema,
            result.data,
          );
          if (!parsedData.success) {
            return context.json({ error: '入力値が不正です' }, 400);
          }
          const data = parsedData.output;
          const uniqueCardIds = [...new Set(data.cardIds)];
          const registeredIds = new Set<string>();
          for (
            let offset = 0;
            offset < uniqueCardIds.length;
            offset += bindParameterLimit
          ) {
            const registeredCards = await db
              .select({ id: cards.id })
              .from(cards)
              .where(
                inArray(
                  cards.id,
                  uniqueCardIds.slice(offset, offset + bindParameterLimit),
                ),
              );
            for (const { id } of registeredCards) {
              registeredIds.add(id);
            }
          }
          const pendingCardValues = uniqueCardIds
            .filter((id) => !registeredIds.has(id))
            .map((id) => ({
              id,
              productId: target.productCode ?? result.targetId,
            }));
          for (
            let offset = 0;
            offset < pendingCardValues.length;
            offset += 50
          ) {
            statements.push(
              db
                .insert(pendingCards)
                .values(pendingCardValues.slice(offset, offset + 50))
                .onConflictDoNothing(),
            );
          }
        } else if (target.kind === 'OFFICIAL_CARD_DETAILS') {
          const parsedData = v.safeParse(
            officialCardDetailsDataSchema,
            result.data,
          );
          if (!parsedData.success) {
            return context.json({ error: '入力値が不正です' }, 400);
          }
          const data = parsedData.output;
          if (data.cardId !== result.targetId) {
            return context.json({ error: '入力値が不正です' }, 400);
          }
          statements.push(
            db
              .insert(cards)
              .values({
                id: data.cardId,
                productId: target.productCode ?? '',
                name: data.name,
                imageKey: data.imageKey,
              })
              .onConflictDoNothing(),
            db.delete(pendingCards).where(eq(pendingCards.id, data.cardId)),
          );
        } else {
          return context.json({ error: 'クロール種別が不正です' }, 400);
        }
      }

      statements.push(
        db
          .update(crawlTargets)
          .set({
            status: result.success ? 'SUCCEEDED' : 'FAILED',
            error: result.success ? null : result.error,
            updatedAt: sql`CURRENT_TIMESTAMP`,
          })
          .where(
            and(
              eq(crawlTargets.crawlRunId, crawlRunId),
              eq(crawlTargets.targetId, result.targetId),
            ),
          ),
        buildCrawlRunStatusUpdate(db, crawlRunId),
      );
      await db.batch(
        statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]],
      );

      return context.json({ accepted: true });
    },
  )
  // ワークフローが結果送信前に異常終了すると対象がPENDINGのまま残り、実行が期限切れまでRUNNINGで固まる
  .post(
    '/runs/:crawlRunId/failure',
    sValidator('param', crawlRunParamsSchema, (result, context) => {
      if (!result.success) {
        return context.json({ error: '入力値が不正です' }, 400);
      }
    }),
    sValidator('json', failureSchema, (result, context) => {
      if (!result.success) {
        return context.json({ error: '入力値が不正です' }, 400);
      }
    }),
    async (context) => {
      const { crawlRunId } = context.req.valid('param');
      const { error } = context.req.valid('json');
      const db = createDisplayDatabase(context.env.DISPLAY_DB);
      const [run] = await db
        .select({ id: crawlRuns.id })
        .from(crawlRuns)
        .where(eq(crawlRuns.id, crawlRunId))
        .limit(1);
      if (run === undefined) {
        return context.json({ error: 'クロール実行が見つかりません' }, 404);
      }

      const pendingTargets = await db
        .select({ targetId: crawlTargets.targetId })
        .from(crawlTargets)
        .where(
          and(
            eq(crawlTargets.crawlRunId, crawlRunId),
            eq(crawlTargets.status, 'PENDING'),
          ),
        )
        .limit(1);
      if (pendingTargets.length === 0) {
        return context.json({ accepted: false });
      }

      await db.batch([
        db
          .update(crawlTargets)
          .set({
            status: 'FAILED',
            error,
            updatedAt: sql`CURRENT_TIMESTAMP`,
          })
          .where(
            and(
              eq(crawlTargets.crawlRunId, crawlRunId),
              eq(crawlTargets.status, 'PENDING'),
            ),
          ),
        buildCrawlRunStatusUpdate(db, crawlRunId),
      ]);

      return context.json({ accepted: true });
    },
  );
