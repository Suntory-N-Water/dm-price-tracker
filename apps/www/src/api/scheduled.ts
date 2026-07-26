import { crawlRuns, createDisplayDatabase } from '@dm-price-tracker/display-db';
import { and, eq, lt, sql } from 'drizzle-orm';
import {
  CrawlAlreadyRunningError,
  NoCrawlTargetsError,
  startMercariCrawl,
} from '@/external/service/crawler/crawl-runs';

export async function runScheduledCrawl(env: CloudflareEnv): Promise<void> {
  const db = createDisplayDatabase(env.DISPLAY_DB);
  await db
    .update(crawlRuns)
    .set({
      status: 'FAILED',
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(
      and(
        eq(crawlRuns.status, 'RUNNING'),
        lt(crawlRuns.expiresAt, sql`CURRENT_TIMESTAMP`),
      ),
    );

  try {
    await startMercariCrawl(env);
  } catch (error) {
    if (
      error instanceof CrawlAlreadyRunningError ||
      error instanceof NoCrawlTargetsError
    ) {
      return;
    }
    throw error;
  }
}
