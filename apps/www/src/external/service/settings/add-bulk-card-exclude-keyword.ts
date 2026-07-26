import { and, eq, inArray } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import {
  bindParameterLimit,
  cardWatches,
  createDisplayDatabase,
  searchConditions,
} from '@dm-price-tracker/display-db';
import { normalizeKeywords } from '@/external/service/search-condition/normalize-keywords';
import { findCommonExcludeKeywords } from '@/external/repository/user-repository';

type BulkExcludeKeywordResult = {
  updated: { cardId: string }[];
  skipped: { cardId: string; reason: string }[];
};

type AddBulkCardExcludeKeywordInput = {
  database: D1Database;
  userEmail: string;
  cardIds: readonly string[];
  excludeKeyword: string;
};

export async function addBulkCardExcludeKeyword({
  database,
  userEmail,
  cardIds,
  excludeKeyword,
}: AddBulkCardExcludeKeywordInput): Promise<BulkExcludeKeywordResult> {
  const db = createDisplayDatabase(database);
  const watchByCardId = new Map<
    string,
    { priceSeriesId: number; normalizedExcludeKeyword: string }
  >();
  // userEmailとisCurrentで2個消費するため、残りをカードIDへ割り当てる
  const cardIdsPerStatement = bindParameterLimit - 2;
  for (let offset = 0; offset < cardIds.length; offset += cardIdsPerStatement) {
    const watches = await db
      .select({
        cardId: cardWatches.cardId,
        priceSeriesId: searchConditions.priceSeriesId,
        normalizedExcludeKeyword: searchConditions.normalizedExcludeKeyword,
      })
      .from(cardWatches)
      .innerJoin(
        searchConditions,
        eq(searchConditions.id, cardWatches.searchConditionId),
      )
      .where(
        and(
          eq(cardWatches.userEmail, userEmail),
          eq(cardWatches.isCurrent, 1),
          inArray(
            cardWatches.cardId,
            cardIds.slice(offset, offset + cardIdsPerStatement),
          ),
        ),
      );
    for (const watch of watches) {
      watchByCardId.set(watch.cardId, watch);
    }
  }
  const commonExcludeKeywords = await findCommonExcludeKeywords(
    database,
    userEmail,
  );
  const statements: BatchItem<'sqlite'>[] = [];
  const result: BulkExcludeKeywordResult = { updated: [], skipped: [] };

  for (const cardId of cardIds) {
    const watch = watchByCardId.get(cardId);
    if (watch === undefined) {
      result.skipped.push({
        cardId,
        reason: '価格チェック中ではありません',
      });
      continue;
    }

    const currentExcludeKeywords =
      watch.normalizedExcludeKeyword === ''
        ? []
        : watch.normalizedExcludeKeyword.split(' ');
    if (currentExcludeKeywords.includes(excludeKeyword)) {
      result.skipped.push({ cardId, reason: '既に設定されています' });
      continue;
    }
    if (currentExcludeKeywords.length >= 3) {
      result.skipped.push({
        cardId,
        reason: '除外ワードの空き枠がありません',
      });
      continue;
    }

    const normalizedExcludeKeyword = normalizeKeywords([
      ...commonExcludeKeywords,
      ...currentExcludeKeywords.filter(
        (keyword) => !commonExcludeKeywords.includes(keyword),
      ),
      excludeKeyword,
    ]).join(' ');
    await db
      .insert(searchConditions)
      .values({
        priceSeriesId: watch.priceSeriesId,
        normalizedExcludeKeyword,
      })
      .onConflictDoNothing();
    const [condition] = await db
      .select({ id: searchConditions.id })
      .from(searchConditions)
      .where(
        and(
          eq(searchConditions.priceSeriesId, watch.priceSeriesId),
          eq(
            searchConditions.normalizedExcludeKeyword,
            normalizedExcludeKeyword,
          ),
        ),
      );
    if (condition === undefined) {
      result.skipped.push({ cardId, reason: '収集条件を作成できませんでした' });
      continue;
    }
    statements.push(
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
    );
    result.updated.push({ cardId });
  }

  if (statements.length > 0) {
    await db.batch(
      statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]],
    );
  }

  return result;
}
