import {
  BaseJob,
  BaseOrchestrator,
  createExecute,
  createJobs,
  createRecords,
  parseMeta,
  type CrawlerDatabase,
  type Execute,
  type InitializerResult,
  type WorkerResult,
} from '@cf-crawler/core';
import type { Job } from '@cf-crawler/core/schema';
import { launch } from '@cloudflare/playwright';
import { parseHTML } from 'linkedom';
import * as v from 'valibot';
import type { CrawlParams } from '../lib/crawlParams';
import { findRegisteredCardIds, saveCrawlResults } from './displayDbRepository';
import {
  DETAIL_KIND,
  detailJobMetaSchema,
  extractListPage,
  extractProductName,
  LIST_KIND,
  listJobMetaSchema,
} from './duelMastersOfficialSite';

export class DuelMastersOfficialCrawlerOrchestrator extends BaseOrchestrator<
  CrawlParams,
  Env
> {
  override initializer(params: CrawlParams): InitializerResult {
    return {
      execute: createExecute(),
      jobs: createJobs([
        {
          url: 'https://dm.takaratomy.co.jp/card/',
          kind: LIST_KIND,
          meta: { productCode: params.productCode },
        },
      ]),
    };
  }

  override async afterFinish(
    execute: Execute,
    db: CrawlerDatabase,
  ): Promise<void> {
    await saveCrawlResults(execute, db, this.env.DISPLAY_DB);
  }
}

export class DuelMastersOfficialCrawlerJob extends BaseJob<Env> {
  override async worker(job: Job): Promise<WorkerResult> {
    switch (job.kind) {
      case LIST_KIND: {
        const meta = v.parse(listJobMetaSchema, parseMeta(job.meta));
        const cardIds = new Set<string>();
        let pageCount = 1;
        let productName = '';
        const browser = await launch(this.env.BROWSER);

        try {
          const page = await browser.newPage();
          const catalogResponse = await page.goto(
            'https://dm.takaratomy.co.jp/card/',
            { waitUntil: 'domcontentloaded' },
          );
          if (catalogResponse === null || !catalogResponse.ok()) {
            throw new Error(
              `商品一覧の取得に失敗しました: ${catalogResponse?.status() ?? '応答なし'}`,
            );
          }
          productName = extractProductName(
            await page.content(),
            meta.productCode,
          );

          for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
            await scheduler.wait(1000);
            const body = new URLSearchParams();
            body.set('suggest', 'on');
            body.append('keyword_type[]', 'card_name');
            body.append('keyword_type[]', 'card_ruby');
            body.append('keyword_type[]', 'card_text');
            body.append('culture_cond[]', '単色');
            body.append('culture_cond[]', '多色');
            body.set('pagenum', String(pageNumber));
            body.set('samename', 'show');
            body.set('products', meta.productCode);
            body.set('sort', 'release_new');
            const response = await page.evaluate(async (requestBody) => {
              const result = await fetch('https://dm.takaratomy.co.jp/card/', {
                method: 'POST',
                headers: {
                  'content-type':
                    'application/x-www-form-urlencoded; charset=UTF-8',
                  'x-requested-with': 'XMLHttpRequest',
                },
                body: requestBody,
              });

              return {
                ok: result.ok,
                status: result.status,
                html: await result.text(),
              };
            }, body.toString());
            if (!response.ok) {
              throw new Error(
                `商品別カード一覧の取得に失敗しました: ${response.status}`,
              );
            }
            const listPage = extractListPage(response.html, meta.productCode);
            pageCount = listPage.pageCount;
            for (const cardId of listPage.cardIds) {
              cardIds.add(cardId);
            }
          }
        } finally {
          await browser.close();
        }

        const registeredCardIds = await findRegisteredCardIds(
          meta.productCode,
          this.env.DISPLAY_DB,
        );

        return createJobs(
          [...cardIds]
            .filter((cardId) => !registeredCardIds.has(cardId))
            .map((cardId) => ({
              url: `https://dm.takaratomy.co.jp/card/detail/?id=${encodeURIComponent(cardId)}`,
              kind: DETAIL_KIND,
              meta: {
                productCode: meta.productCode,
                productName,
                cardId,
              },
            })),
        );
      }

      case DETAIL_KIND: {
        const meta = v.parse(detailJobMetaSchema, parseMeta(job.meta));
        await scheduler.wait(1000);
        const browser = await launch(this.env.BROWSER);

        try {
          const page = await browser.newPage({
            deviceScaleFactor: 2,
            viewport: { width: 1280, height: 960 },
          });
          const response = await page.goto(job.url, {
            waitUntil: 'domcontentloaded',
          });
          if (response === null || !response.ok()) {
            throw new Error(
              `カード詳細の取得に失敗しました: ${response?.status() ?? '応答なし'} ${job.url}`,
            );
          }
          const { document } = parseHTML(await page.content());
          const cardNameElement = document.querySelector('h3.card-name');
          cardNameElement?.querySelector('span.packname')?.remove();
          const name = cardNameElement?.textContent?.trim() ?? '';
          const imageLocator = page.locator('.card-img img').first();
          if (name === '' || (await imageLocator.count()) === 0) {
            throw new Error(
              `カード詳細の必須項目を抽出できません: ${meta.cardId}`,
            );
          }
          await imageLocator.waitFor({ state: 'visible' });
          const imageKey = `cards/${meta.cardId}.png`;
          const image = await imageLocator.screenshot({ type: 'png' });
          await this.env.CARD_IMAGES.put(imageKey, image, {
            httpMetadata: { contentType: 'image/png' },
          });
          return createRecords([
            {
              url: job.url,
              data: {
                id: meta.cardId,
                productCode: meta.productCode,
                productName: meta.productName,
                name,
                imageKey,
              },
            },
          ]);
        } finally {
          await browser.close();
        }
      }

      default:
        throw new Error(`未対応のJob kindです: ${job.kind}`);
    }
  }
}
