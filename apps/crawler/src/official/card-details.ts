import { chromium } from 'playwright';
import {
  getCrawlRun,
  readTargetIds,
  sendCrawlResult,
} from '../lib/crawler-api';
import { CARD_IMAGES_BUCKET, putR2Object } from '../lib/r2';
import { retryTarget } from '../lib/retry';
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
      try {
        await retryTarget(async () => {
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
            await sendCrawlResult({
              targetId: target.cardId,
              success: true,
              data: {
                cardId: target.cardId,
                name: result.name,
                imageKey,
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
          `カード ${target.cardId} の詳細取得に失敗しました`,
          error,
        );
        await sendCrawlResult({
          targetId: target.cardId,
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
  console.error('カード詳細収集を完了できませんでした', error);
  process.exitCode = 1;
});
