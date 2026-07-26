import type { Page } from 'playwright';

const ITEM_SELECTOR = 'a[data-testid="thumbnail-link"][href^="/item/"]';
const SEARCH_RESULT_SELECTOR = '#search-result';
const YEN_PRICE_PATTERN = /([0-9,]+)円(?:\s+US\$[0-9,.]+)?$/u;

export type MercariTarget = {
  searchConditionId: string;
  cardName: string;
  additionalKeyword: string;
  excludeKeyword: string;
};

export type MercariItem = {
  url: string;
  title: string;
  price: number;
};

export function buildMercariSearchUrl(target: MercariTarget): string {
  const url = new URL('https://jp.mercari.com/search');
  url.searchParams.set(
    'keyword',
    [target.cardName, target.additionalKeyword]
      .filter((word) => word !== '')
      .join(' '),
  );
  url.searchParams.set('sort', 'created_time');
  url.searchParams.set('order', 'desc');
  url.searchParams.set('category_id', '1290');
  if (target.excludeKeyword !== '') {
    url.searchParams.set('exclude_keyword', target.excludeKeyword);
  }
  return url.toString();
}

export function extractYenPrice(label: string): number | undefined {
  const priceText = label.match(YEN_PRICE_PATTERN)?.[1];
  if (priceText === undefined) {
    return;
  }
  const price = Number.parseInt(priceText.replaceAll(',', ''), 10);
  return Number.isNaN(price) ? undefined : price;
}

export async function extractMercariSearch(
  page: Page,
  target: MercariTarget,
): Promise<{ items: MercariItem[]; screenshot: Uint8Array }> {
  const url = buildMercariSearchUrl(target);
  const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
  if (response === null || !response.ok()) {
    throw new Error(
      `検索結果ページの取得に失敗しました: ${response?.status() ?? '応答なし'}`,
    );
  }

  const itemLocator = page.locator(ITEM_SELECTOR);
  await itemLocator
    .first()
    .or(page.getByText('出品された商品がありません', { exact: true }))
    .waitFor({ state: 'visible' });
  if ((await itemLocator.count()) === 0) {
    const closeButton = page.getByRole('button', { name: '閉じる' }).first();
    if (await closeButton.isVisible()) {
      await closeButton.click();
    }
    return {
      items: [],
      screenshot: await page.locator(SEARCH_RESULT_SELECTOR).screenshot(),
    };
  }

  const itemsByUrl = new Map<string, MercariItem>();
  for (let attempt = 0; attempt <= 20; attempt += 1) {
    const visibleItems = await itemLocator.evaluateAll((anchors) =>
      anchors.map((anchor) => ({
        url: (anchor as HTMLAnchorElement).href,
        title:
          anchor
            .querySelector('[data-testid="thumbnail-item-name"]')
            ?.textContent?.trim() ?? '',
        priceLabel:
          anchor
            .querySelector('.merItemThumbnail[role="img"]')
            ?.getAttribute('aria-label') ?? '',
      })),
    );
    const previousCount = itemsByUrl.size;
    for (const item of visibleItems) {
      const price = extractYenPrice(item.priceLabel);
      if (item.title === '' || price === undefined) {
        throw new Error(`出品情報の抽出に失敗しました: ${item.url}`);
      }
      itemsByUrl.set(item.url, {
        url: item.url,
        title: item.title,
        price,
      });
    }
    if (attempt > 0 && itemsByUrl.size === previousCount) {
      break;
    }
    await page.mouse.wheel(0, 2000);
    await page.waitForTimeout(800);
  }

  const closeButton = page.getByRole('button', { name: '閉じる' }).first();
  if (await closeButton.isVisible()) {
    await closeButton.click();
  }
  await itemLocator.evaluateAll((anchors) => {
    const pricePattern = /([0-9,]+)円(?:\s+US\$[0-9,.]+)?$/u;
    for (const anchor of anchors) {
      const label =
        anchor
          .querySelector('.merItemThumbnail[role="img"]')
          ?.getAttribute('aria-label') ?? '';
      const yenPrice = label.match(pricePattern)?.[1];
      const priceElement = anchor.querySelector('.merPrice');
      if (yenPrice !== undefined && priceElement !== null) {
        priceElement.textContent = `${yenPrice}円`;
      }
      for (const image of Array.from(anchor.querySelectorAll('img'))) {
        image.loading = 'eager';
      }
    }
  });

  return {
    items: [...itemsByUrl.values()],
    screenshot: await page.locator(SEARCH_RESULT_SELECTOR).screenshot(),
  };
}
