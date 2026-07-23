import {
  BaseJob,
  createRecords,
  parseMeta,
  type WorkerResult,
} from '@cf-crawler/core';
import type { Job } from '@cf-crawler/core/schema';
import { launch } from '@cloudflare/playwright';
import * as v from 'valibot';
import { buildScreenshotKey, jobMetaSchema, LIST_KIND } from './mercari';

const SCROLL_STEP_PX = 2000;
const SCROLL_WAIT_MS = 800;
const MAX_SCROLL_ATTEMPTS = 20;

export class MercariCrawlerJob extends BaseJob<Env> {
  override async worker(job: Job): Promise<WorkerResult> {
    switch (job.kind) {
      case LIST_KIND: {
        const meta = v.parse(jobMetaSchema, parseMeta(job.meta));
        const browser = await launch(this.env.BROWSER);

        try {
          const page = await browser.newPage();
          const response = await page.goto(job.url, {
            waitUntil: 'domcontentloaded',
          });
          if (response === null || !response.ok()) {
            throw new Error(`検索結果ページの取得に失敗しました: ${job.url}`);
          }

          const itemLocator = page.locator(
            'a[data-testid="thumbnail-link"][href^="/item/"]',
          );
          await itemLocator
            .first()
            .or(page.getByText('出品された商品がありません', { exact: true }))
            .waitFor({ state: 'visible' });

          // メルカリの検索結果はIntersectionObserverによる無限スクロールで
          // 1ページ目の出品を追加読み込みするため、件数が増えなくなるまでスクロールする
          let previousCount = await itemLocator.count();
          for (
            let attempt = 0;
            previousCount > 0 && attempt < MAX_SCROLL_ATTEMPTS;
            attempt += 1
          ) {
            await page.mouse.wheel(0, SCROLL_STEP_PX);
            await page.waitForTimeout(SCROLL_WAIT_MS);
            const currentCount = await itemLocator.count();
            if (currentCount === previousCount) {
              break;
            }
            previousCount = currentCount;
          }

          // メルカリの検索結果は仮想化リストで、ビューポート近傍の出品しか
          // DOM上に存在しない。スクロールで通過した範囲は評価時点で失われるため、
          // 出品ごとのtitle/priceはこの一覧DOMから直接抽出する(詳細ページには遷移しない)。
          const items = await itemLocator.evaluateAll((anchors) =>
            anchors.map((anchor) => ({
              url: (anchor as HTMLAnchorElement).href,
              title:
                anchor
                  .querySelector('[data-testid="thumbnail-item-name"]')
                  ?.textContent?.trim() ?? '',
              // 価格要素にdata-testidはないが、`merPrice`クラスはビルドハッシュを
              // 含まない安定したクラス名のため、ここから抽出する。
              priceText: anchor.querySelector('.merPrice')?.textContent ?? '',
            })),
          );

          // fullPageスクリーンショットはビューポートを仮想拡大して撮影するため、
          // loading="lazy"の判定がその時点で再評価され、読み込み済みのはずの画像が
          // プレースホルダーに戻ってしまう。撮影前にeagerへ切り替えて回避する。
          await itemLocator.evaluateAll((anchors) => {
            for (const anchor of anchors) {
              for (const img of anchor.querySelectorAll('img')) {
                img.loading = 'eager';
              }
            }
          });
          const screenshot = await page.screenshot({ fullPage: true });
          await this.env.SCREENSHOTS.put(
            buildScreenshotKey(meta.search_condition_id, job.id),
            screenshot,
            { httpMetadata: { contentType: 'image/png' } },
          );

          const itemsByUrl = new Map(items.map((item) => [item.url, item]));
          const records = [...itemsByUrl.values()].map((item) => {
            const price = Number.parseInt(
              item.priceText.replaceAll(/[^\d]/g, ''),
              10,
            );
            if (item.title === '' || Number.isNaN(price)) {
              throw new Error(`出品情報の抽出に失敗しました: ${item.url}`);
            }
            return { url: item.url, data: { title: item.title, price } };
          });

          return createRecords(records);
        } finally {
          await browser.close();
        }
      }

      default:
        throw new Error(`未対応のJob kindです: ${job.kind}`);
    }
  }
}
