import { chromium } from 'playwright';
import { getCrawlRun, readTargetIds } from '../lib/crawler-api';
import { CARD_IMAGES_BUCKET, putR2Object } from '../lib/r2';
import { runCrawlerTarget } from '../lib/retry';
import { extractOfficialCardDetails } from './extract';

async function main(): Promise<void> {
  const run = await getCrawlRun();
  if (run.kind !== 'OFFICIAL_CARD_DETAILS') {
    throw new Error(`クロール種別が一致しません: ${run.kind}`);
  }
  const selectedTargetIds = readTargetIds();
  const targets =
    selectedTargetIds === undefined
      ? run.targets
      : run.targets.filter((target) =>
          selectedTargetIds.includes(target.cardId),
        );
  const browser = await chromium.launch();
  let succeededCount = 0;

  try {
    for (const target of targets) {
      const succeeded = await runCrawlerTarget({
        targetId: target.cardId,
        label: `カード ${target.cardId} の詳細`,
        operation: async () => {
          const page = await browser.newPage({
            deviceScaleFactor: 2,
            viewport: { width: 1280, height: 960 },
          });
          try {
            const result = await extractOfficialCardDetails(
              page,
              target.cardId,
            );
            const imageKey = `cards/${target.cardId}.png`;
            await putR2Object({
              bucket: CARD_IMAGES_BUCKET,
              key: imageKey,
              body: result.image,
            });
            return {
              cardId: target.cardId,
              name: result.name,
              imageKey,
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
  console.error('カード詳細収集を完了できませんでした', error);
  process.exitCode = 1;
});
