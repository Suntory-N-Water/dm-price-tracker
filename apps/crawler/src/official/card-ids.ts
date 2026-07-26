import { chromium } from 'playwright';
import { getCrawlRun } from '../lib/crawler-api';
import { runCrawlerTarget } from '../lib/retry';
import { fetchOfficialCardIdsPage } from './extract';

async function main(): Promise<void> {
  const run = await getCrawlRun();
  if (run.kind !== 'OFFICIAL_CARD_IDS') {
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
      label: `商品 ${target.targetId} のカードID収集`,
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

          let pageCount = 1;
          const cardIds = new Set<string>();
          for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
            const listPage = await fetchOfficialCardIdsPage(
              page,
              target.targetId,
              pageNumber,
            );
            pageCount = listPage.pageCount;
            for (const cardId of listPage.cardIds) {
              cardIds.add(cardId);
            }
          }
          return { cardIds: [...cardIds] };
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
  console.error('商品別カードID収集を完了できませんでした', error);
  process.exitCode = 1;
});
