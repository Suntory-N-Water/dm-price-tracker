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

const REQUEST_HEADERS = {
  accept: 'text/html,application/xhtml+xml',
  'user-agent':
    'Mozilla/5.0 (compatible; cf-crawler/1.0; +https://dm.takaratomy.co.jp/card/)',
};

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

        const catalogResponse = await fetch(
          'https://dm.takaratomy.co.jp/card/',
          { headers: REQUEST_HEADERS },
        );
        if (!catalogResponse.ok) {
          throw new Error(
            `商品一覧の取得に失敗しました: ${catalogResponse.status}`,
          );
        }
        const catalogHtml = await catalogResponse.text();
        productName = extractProductName(catalogHtml, meta.productCode);

        for (let page = 1; page <= pageCount; page += 1) {
          await scheduler.wait(1000);
          const body = new URLSearchParams();
          body.set('suggest', 'on');
          body.append('keyword_type[]', 'card_name');
          body.append('keyword_type[]', 'card_ruby');
          body.append('keyword_type[]', 'card_text');
          body.append('culture_cond[]', '単色');
          body.append('culture_cond[]', '多色');
          body.set('pagenum', String(page));
          body.set('samename', 'show');
          body.set('products', meta.productCode);
          body.set('sort', 'release_new');
          const response = await fetch('https://dm.takaratomy.co.jp/card/', {
            method: 'POST',
            headers: {
              ...REQUEST_HEADERS,
              'content-type':
                'application/x-www-form-urlencoded; charset=UTF-8',
              'x-requested-with': 'XMLHttpRequest',
            },
            body,
          });
          if (!response.ok) {
            throw new Error(
              `商品別カード一覧の取得に失敗しました: ${response.status}`,
            );
          }
          const listPage = extractListPage(
            await response.text(),
            meta.productCode,
          );
          pageCount = listPage.pageCount;
          for (const cardId of listPage.cardIds) {
            cardIds.add(cardId);
          }
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
        const response = await fetch(job.url, { headers: REQUEST_HEADERS });
        if (!response.ok) {
          throw new Error(
            `カード詳細の取得に失敗しました: ${response.status} ${job.url}`,
          );
        }
        const html = await response.text();
        const { document } = parseHTML(html);
        const cardNameElement = document.querySelector('h3.card-name');
        cardNameElement?.querySelector('span.packname')?.remove();
        const name = cardNameElement?.textContent?.trim() ?? '';
        const imageSrc = document
          .querySelector('.card-img img[src]')
          ?.getAttribute('src');
        if (name === '' || imageSrc === null || imageSrc === undefined) {
          throw new Error(
            `カード詳細の必須項目を抽出できません: ${meta.cardId}`,
          );
        }
        const extension =
          new URL(imageSrc, 'https://dm.takaratomy.co.jp').pathname
            .match(/\.(?:jpe?g|png|webp)$/i)?.[0]
            ?.toLowerCase() ?? '.jpg';
        const imageKey = `cards/${meta.cardId}${extension}`;
        const imageUrl = new URL(
          imageSrc,
          'https://dm.takaratomy.co.jp',
        ).toString();

        await scheduler.wait(1000);
        const imageResponse = await fetch(imageUrl);
        if (!imageResponse.ok || imageResponse.body === null) {
          throw new Error(
            `カード画像の取得に失敗しました: ${imageResponse.status} ${imageUrl}`,
          );
        }
        await this.env.CARD_IMAGES.put(imageKey, imageResponse.body, {
          httpMetadata: {
            contentType:
              imageResponse.headers.get('content-type') ?? 'image/jpeg',
          },
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
      }

      default:
        throw new Error(`未対応のJob kindです: ${job.kind}`);
    }
  }
}
