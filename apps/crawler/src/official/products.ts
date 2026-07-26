import { chromium } from 'playwright';
import { getCrawlRun } from '../lib/crawler-api';
import { runCrawlerTarget } from '../lib/retry';
import { extractOfficialProducts } from './extract';

async function main(): Promise<void> {
  const run = await getCrawlRun();
  if (run.kind !== 'OFFICIAL_PRODUCTS') {
    throw new Error(`クロール種別が一致しません: ${run.kind}`);
  }
  const [target] = run.targets;
  if (target === undefined) {
    return;
  }
  const browser = await chromium.launch();

  try {
    const succeeded = await runCrawlerTarget({
      targetId: target.targetId,
      label: '公式商品一覧',
      operation: async () => {
        const page = await browser.newPage();
        try {
          const response = await page.goto(
            'https://dm.takaratomy.co.jp/card/',
            { waitUntil: 'domcontentloaded' },
          );
          if (response === null || !response.ok()) {
            throw new Error(
              `商品一覧の取得に失敗しました: ${response?.status() ?? '応答なし'}`,
            );
          }
          return { products: await extractOfficialProducts(page) };
        } finally {
          await page.close();
        }
      },
    });
    if (!succeeded) {
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
  }
}

main().catch((error: unknown) => {
  console.error('公式商品マスター更新を完了できませんでした', error);
  process.exitCode = 1;
});
