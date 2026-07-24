import { WorkerEntrypoint } from 'cloudflare:workers';
import { createCrawlerDatabase, executes, jobs } from '@cf-crawler/core';
import {
  createDisplayDatabase,
  products as displayProducts,
} from '@dm-price-tracker/display-db';
import {
  and,
  desc,
  eq,
  gt,
  isNotNull,
  isNull,
  notExists,
  sql,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import * as v from 'valibot';
import { crawlParamsSchema } from './lib/crawlParams';
import { listJobMetaSchema } from './crawler/duelMastersOfficialSite';
import { extractProducts } from './crawler/products';

export {
  DuelMastersOfficialCrawlerJob,
  DuelMastersOfficialCrawlerOrchestrator,
} from './crawler';

export default class DuelMastersOfficialCrawlerService extends WorkerEntrypoint<Env> {
  override async fetch(request: Request): Promise<Response> {
    const requestUrl = new URL(request.url);

    if (request.method === 'GET' && requestUrl.pathname === '/health') {
      return Response.json({ ok: true });
    }

    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  async crawl(productCode: string) {
    const params = v.parse(crawlParamsSchema, { productCode });
    const instance = await this.env.ORCHESTRATOR.create({ params });

    return {
      id: instance.id,
      status: await instance.status(),
    };
  }

  async syncProducts(): Promise<{ syncedCount: number }> {
    const response = await fetch('https://dm.takaratomy.co.jp/card/', {
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'user-agent':
          'Mozilla/5.0 (compatible; cf-crawler/1.0; +https://dm.takaratomy.co.jp/card/)',
      },
    });
    if (!response.ok) {
      throw new Error(`商品一覧の取得に失敗しました: ${response.status}`);
    }
    const products = extractProducts(await response.text());
    const displayDb = createDisplayDatabase(this.env.DISPLAY_DB);

    for (let offset = 0; offset < products.length; offset += 33) {
      await displayDb
        .insert(displayProducts)
        .values(products.slice(offset, offset + 33))
        .onConflictDoUpdate({
          target: displayProducts.code,
          set: {
            name: sql`excluded.name`,
            displayOrder: sql`excluded.display_order`,
          },
        });
    }

    return { syncedCount: products.length };
  }

  async listProductCrawls(): Promise<
    {
      productCode: string;
      status: 'WAITING' | 'RUNNING' | 'FINISHED' | 'ABORTED';
      updatedAt: string;
      error: string | null;
    }[]
  > {
    const crawlerDb = createCrawlerDatabase(this.env.DB);
    const rootJobs = alias(jobs, 'root_jobs');
    const failedJobs = alias(jobs, 'failed_jobs');
    const newerFailedJobs = alias(jobs, 'newer_failed_jobs');
    const result = await crawlerDb
      .select({
        status: executes.status,
        updatedAt: executes.updatedAt,
        meta: rootJobs.meta,
        error: failedJobs.resultError,
      })
      .from(executes)
      .innerJoin(
        rootJobs,
        and(
          eq(rootJobs.executeId, executes.id),
          isNull(rootJobs.parentJobId),
          eq(rootJobs.kind, 'LIST'),
        ),
      )
      .leftJoin(
        failedJobs,
        and(
          eq(failedJobs.executeId, executes.id),
          isNotNull(failedJobs.resultError),
          notExists(
            crawlerDb
              .select({ id: newerFailedJobs.id })
              .from(newerFailedJobs)
              .where(
                and(
                  eq(newerFailedJobs.executeId, failedJobs.executeId),
                  isNotNull(newerFailedJobs.resultError),
                  gt(newerFailedJobs.updatedAt, failedJobs.updatedAt),
                ),
              ),
          ),
        ),
      )
      .orderBy(desc(executes.updatedAt));
    const latestCrawlByProduct = new Map<
      string,
      {
        productCode: string;
        status: 'WAITING' | 'RUNNING' | 'FINISHED' | 'ABORTED';
        updatedAt: string;
        error: string | null;
      }
    >();

    for (const row of result) {
      const { productCode } = v.parse(listJobMetaSchema, JSON.parse(row.meta));
      if (!latestCrawlByProduct.has(productCode)) {
        latestCrawlByProduct.set(productCode, {
          productCode,
          status: row.status,
          updatedAt: row.updatedAt,
          error: row.error,
        });
      }
    }

    return [...latestCrawlByProduct.values()];
  }
}
