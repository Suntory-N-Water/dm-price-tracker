import {
  parseMeta,
  type CrawlerDatabase,
  type Execute,
} from '@cf-crawler/core';
import {
  jobs as crawlerJobs,
  records as crawlerRecords,
} from '@cf-crawler/core/schema';
import {
  createDisplayDatabase,
  pricePoints,
  screenshots,
} from '@dm-price-tracker/display-db';
import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import * as v from 'valibot';
import {
  buildScreenshotKey,
  jobMetaSchema,
  LIST_KIND,
  mercariRecordSchema,
} from './mercari';
import { calculateMedianUnitPrice } from './priceAggregation';

export async function saveCrawlResults(
  execute: Execute,
  crawlerDb: CrawlerDatabase,
  displayDbBinding: D1Database,
): Promise<void> {
  const [recordRows, finishedRootListJobs] = await Promise.all([
    crawlerDb
      .select({ data: crawlerRecords.data, meta: crawlerRecords.meta })
      .from(crawlerRecords)
      .innerJoin(crawlerJobs, eq(crawlerRecords.jobId, crawlerJobs.id))
      .where(eq(crawlerJobs.executeId, execute.id)),
    crawlerDb
      .select({
        id: crawlerJobs.id,
        crawledAt: sql<string>`${crawlerJobs.crawledAt}`,
        meta: crawlerJobs.meta,
      })
      .from(crawlerJobs)
      .where(
        and(
          eq(crawlerJobs.executeId, execute.id),
          eq(crawlerJobs.kind, LIST_KIND),
          eq(crawlerJobs.status, 'FINISHED'),
          isNull(crawlerJobs.parentJobId),
          isNotNull(crawlerJobs.crawledAt),
        ),
      ),
  ]);
  const itemsByCondition = new Map<
    number,
    { title: string; price: number }[]
  >();

  for (const row of recordRows) {
    const meta = v.parse(jobMetaSchema, parseMeta(row.meta));
    const record = v.parse(mercariRecordSchema, JSON.parse(row.data));
    const items = itemsByCondition.get(meta.search_condition_id) ?? [];
    items.push({ title: record.title, price: record.price });
    itemsByCondition.set(meta.search_condition_id, items);
  }

  const pricePointValues = finishedRootListJobs.flatMap((job) => {
    const meta = v.parse(jobMetaSchema, parseMeta(job.meta));
    const price = calculateMedianUnitPrice(
      itemsByCondition.get(meta.search_condition_id) ?? [],
    );

    return price === undefined
      ? []
      : [
          {
            searchConditionId: meta.search_condition_id,
            crawledAt: job.crawledAt,
            price,
          },
        ];
  });
  const screenshotValues = finishedRootListJobs.map((job) => {
    const meta = v.parse(jobMetaSchema, parseMeta(job.meta));
    return {
      searchConditionId: meta.search_condition_id,
      crawledAt: job.crawledAt,
      imageKey: buildScreenshotKey(meta.search_condition_id, job.id),
    };
  });
  const displayDb = createDisplayDatabase(displayDbBinding);

  if (pricePointValues.length > 0) {
    await displayDb
      .insert(pricePoints)
      .values(pricePointValues)
      .onConflictDoNothing();
  }
  if (screenshotValues.length > 0) {
    await displayDb
      .insert(screenshots)
      .values(screenshotValues)
      .onConflictDoNothing();
  }
}
