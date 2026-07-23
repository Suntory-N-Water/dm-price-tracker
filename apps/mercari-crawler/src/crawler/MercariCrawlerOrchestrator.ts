import {
  BaseOrchestrator,
  createExecute,
  createJobs,
  type CrawlerDatabase,
  type Execute,
  type InitializerResult,
} from '@cf-crawler/core';
import {
  cardWatches,
  cards,
  createDisplayDatabase,
  priceSeries,
  searchConditions,
} from '@dm-price-tracker/display-db';
import { eq, exists, sql } from 'drizzle-orm';
import { saveCrawlResults } from './crawlResultRepository';
import { LIST_KIND, scopeJobUrl } from './mercari';

export class MercariCrawlerOrchestrator extends BaseOrchestrator<
  Record<string, never>,
  Env
> {
  override async initializer(
    _params: Record<string, never>,
  ): Promise<InitializerResult> {
    const db = createDisplayDatabase(this.env.DISPLAY_DB);
    const conditions = await db
      .select({
        id: searchConditions.id,
        cardName: cards.name,
        additionalKeyword: priceSeries.normalizedAdditionalKeyword,
        excludeKeyword: searchConditions.normalizedExcludeKeyword,
      })
      .from(searchConditions)
      .innerJoin(
        priceSeries,
        eq(priceSeries.id, searchConditions.priceSeriesId),
      )
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

    return {
      execute: createExecute(),
      jobs: createJobs(
        conditions.map((condition) => {
          const url = new URL('https://jp.mercari.com/search');
          url.searchParams.set(
            'keyword',
            [condition.cardName, condition.additionalKeyword]
              .filter((word) => word !== '')
              .join(' '),
          );
          url.searchParams.set('sort', 'created_time');
          url.searchParams.set('order', 'desc');
          url.searchParams.set('category_id', '1290');
          if (condition.excludeKeyword !== '') {
            url.searchParams.set('exclude_keyword', condition.excludeKeyword);
          }

          return {
            url: scopeJobUrl(url, condition.id),
            kind: LIST_KIND,
            meta: { search_condition_id: condition.id },
          };
        }),
      ),
    };
  }

  override async afterFinish(
    execute: Execute,
    db: CrawlerDatabase,
  ): Promise<void> {
    await saveCrawlResults(execute, db, this.env.DISPLAY_DB);
  }
}
