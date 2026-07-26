import { chromium } from 'playwright';
import { getCrawlRun, readTargetIds } from '../lib/crawler-api';
import { putR2Object, SCREENSHOTS_BUCKET } from '../lib/r2';
import { runCrawlerTarget } from '../lib/retry';
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
      const succeeded = await runCrawlerTarget({
        targetId: target.searchConditionId,
        label: `メルカリ検索条件 ${target.searchConditionId}`,
        operation: async () => {
          const page = await browser.newPage();
          try {
            const result = await extractMercariSearch(page, target);
            const imageKey = `screenshots/${target.searchConditionId}/${process.env['CRAWL_RUN_ID']}.png`;
            await putR2Object({
              bucket: SCREENSHOTS_BUCKET,
              key: imageKey,
              body: result.screenshot,
            });
            return {
              imageKey,
              items: result.items.map(({ title, price }) => ({
                title,
                price,
              })),
            };
          } finally {
            await page.close();
          }
        },
      });
      if (succeeded) {
        succeededCount += 1;
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
