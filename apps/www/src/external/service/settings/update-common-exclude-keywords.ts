import { and, asc, eq, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import {
  cardWatches,
  createDisplayDatabase,
  searchConditions,
  userCommonExcludeKeywords,
} from '@dm-price-tracker/display-db';
import { normalizeKeywords } from '@/external/service/search-condition/normalize-keywords';
import { findCommonExcludeKeywords } from '@/external/repository/user-repository';

export async function updateCommonExcludeKeywords(
  database: D1Database,
  userEmail: string,
  newCommonExcludeKeywords: readonly string[],
): Promise<number> {
  const previousCommonExcludeKeywords = await findCommonExcludeKeywords(
    database,
    userEmail,
  );
  if (
    previousCommonExcludeKeywords.join(' ') ===
    newCommonExcludeKeywords.join(' ')
  ) {
    return 0;
  }

  const db = createDisplayDatabase(database);
  const currentWatches = await db
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
      and(eq(cardWatches.userEmail, userEmail), eq(cardWatches.isCurrent, 1)),
    )
    .orderBy(asc(cardWatches.cardId));

  const statements: BatchItem<'sqlite'>[] = [0, 1, 2].map((position) =>
    db
      .insert(userCommonExcludeKeywords)
      .values({
        userEmail,
        position,
        keyword: newCommonExcludeKeywords[position] ?? '',
      })
      .onConflictDoUpdate({
        target: [
          userCommonExcludeKeywords.userEmail,
          userCommonExcludeKeywords.position,
        ],
        set: { keyword: sql`excluded.keyword` },
      }),
  );

  for (const watch of currentWatches) {
    const previousExcludeKeywords =
      watch.normalizedExcludeKeyword === ''
        ? []
        : watch.normalizedExcludeKeyword.split(' ');
    const cardExcludeKeywords = previousExcludeKeywords
      .filter((keyword) => !previousCommonExcludeKeywords.includes(keyword))
      .slice(0, 3 - newCommonExcludeKeywords.length);
    const normalizedExcludeKeyword = normalizeKeywords([
      ...newCommonExcludeKeywords,
      ...cardExcludeKeywords,
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
      throw new Error('収集条件を作成できませんでした');
    }
    statements.push(
      db
        .update(cardWatches)
        .set({ isCurrent: 0 })
        .where(
          and(
            eq(cardWatches.userEmail, userEmail),
            eq(cardWatches.cardId, watch.cardId),
            eq(cardWatches.isCurrent, 1),
          ),
        ),
      db.insert(cardWatches).values({
        userEmail,
        cardId: watch.cardId,
        searchConditionId: condition.id,
        isCurrent: 1,
      }),
    );
  }

  await db.batch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);

  return currentWatches.length;
}
