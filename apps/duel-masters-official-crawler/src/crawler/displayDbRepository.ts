import type { CrawlerDatabase, Execute } from '@cf-crawler/core';
import { jobs, records } from '@cf-crawler/core/schema';
import {
  cards,
  createDisplayDatabase,
  products,
} from '@dm-price-tracker/display-db';
import { eq } from 'drizzle-orm';
import * as v from 'valibot';
import { duelMastersOfficialRecordSchema } from './duelMastersOfficialSite';

export async function findRegisteredCardIds(
  productCode: string,
  displayDbBinding: D1Database,
): Promise<Set<string>> {
  const registeredCards = await createDisplayDatabase(displayDbBinding)
    .select({ id: cards.id })
    .from(cards)
    .where(eq(cards.productId, productCode));

  return new Set(registeredCards.map((card) => card.id));
}

export async function saveCrawlResults(
  execute: Execute,
  crawlerDb: CrawlerDatabase,
  displayDbBinding: D1Database,
): Promise<void> {
  const rows = await crawlerDb
    .select({ data: records.data })
    .from(records)
    .innerJoin(jobs, eq(records.jobId, jobs.id))
    .where(eq(jobs.executeId, execute.id));
  const crawledCards = rows.map((row) =>
    v.parse(duelMastersOfficialRecordSchema, JSON.parse(row.data)),
  );
  if (crawledCards.length === 0) {
    return;
  }

  const [firstCard] = crawledCards;
  if (firstCard === undefined) {
    return;
  }
  if (
    crawledCards.some(
      (card) =>
        card.productCode !== firstCard.productCode ||
        card.productName !== firstCard.productName,
    )
  ) {
    throw new Error('1回の実行に複数の商品が含まれています');
  }

  const displayDb = createDisplayDatabase(displayDbBinding);
  await displayDb
    .insert(products)
    .values({ code: firstCard.productCode, name: firstCard.productName })
    .onConflictDoNothing();

  // D1のバインド変数上限を超えないよう、4カラム×20件ずつ登録する
  for (let offset = 0; offset < crawledCards.length; offset += 20) {
    await displayDb
      .insert(cards)
      .values(
        crawledCards.slice(offset, offset + 20).map((card) => ({
          id: card.id,
          productId: card.productCode,
          name: card.name,
          imageKey: card.imageKey,
        })),
      )
      .onConflictDoNothing();
  }
}
