import { chromium } from 'playwright';
import {
  getCrawlRun,
  readTargetIds,
  sendCrawlResult,
} from '../lib/crawler-api';
import { putR2Object, SCREENSHOTS_BUCKET } from '../lib/r2';
import { retryTarget } from '../lib/retry';
import { extractMercariSearch } from './extract';

async function main(): Promise<void> {
  const run = await getCrawlRun();
  if (run.kind !== 'MERCARI') {
    throw new Error(`クロール種別が一致しません: ${run.kind}`);
  }
  const selectedTargetIds = readTargetIds();
  const targets =
    selectedTargetIds === undefined
      ? run.targets
      : run.targets.filter((target) =>
          selectedTargetIds.includes(target.searchConditionId),
        );
  const browser = await chromium.launch();
  let succeededCount = 0;

  try {
    for (const target of targets) {
      try {
        await retryTarget(async () => {
          const page = await browser.newPage();
          try {
            const result = await extractMercariSearch(page, target);
            const imageKey = `screenshots/${target.searchConditionId}/${process.env['CRAWL_RUN_ID']}.png`;
            await putR2Object({
              bucket: SCREENSHOTS_BUCKET,
              key: imageKey,
              body: result.screenshot,
            });
            await sendCrawlResult({
              targetId: target.searchConditionId,
              success: true,
              data: {
                imageKey,
                items: result.items.map(({ title, price }) => ({
                  title,
                  price,
                })),
              },
            });
          } finally {
            await page.close();
          }
        });
        succeededCount += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : '不明なエラー';
        console.error(
          `メルカリ検索条件 ${target.searchConditionId} の取得に失敗しました`,
          error,
        );
        await sendCrawlResult({
          targetId: target.searchConditionId,
          success: false,
          error: message,
        });
      }
    }
  } finally {
    await browser.close();
  }

  if (targets.length > 0 && succeededCount === 0) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error('メルカリ価格取得を完了できませんでした', error);
  process.exitCode = 1;
});
