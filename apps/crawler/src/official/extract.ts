import type { Locator, Page } from 'playwright';

export type OfficialProduct = {
  code: string;
  name: string;
  displayOrder: number;
};

export function normalizeOfficialProducts(
  options: readonly { code: string; name: string }[],
): OfficialProduct[] {
  const products = new Map<string, OfficialProduct>();
  for (const option of options) {
    const code = option.code.trim();
    const name = option.name.trim();
    if (code === '' || name === '' || !/^[a-z0-9]+$/u.test(code)) {
      continue;
    }
    if (!products.has(code)) {
      products.set(code, { code, name, displayOrder: products.size });
    }
  }
  if (products.size === 0) {
    throw new Error('商品一覧を抽出できませんでした');
  }
  return [...products.values()];
}

export async function extractOfficialProducts(
  page: Page,
): Promise<OfficialProduct[]> {
  const options = await page
    .locator('select[name="products"] option')
    .evaluateAll((elements) =>
      elements.map((element) => ({
        code: element.getAttribute('value') ?? '',
        name: element.textContent ?? '',
      })),
    );
  return normalizeOfficialProducts(options);
}

export function validateOfficialCardIds(
  cardIds: readonly string[],
  productCode: string,
): string[] {
  if (
    cardIds.some(
      (cardId) =>
        !cardId.startsWith(`${productCode}-`) &&
        !cardId.startsWith(`dm${productCode}-`),
    )
  ) {
    throw new Error(`商品コードの絞り込みに失敗しました: ${productCode}`);
  }
  return [...new Set(cardIds)];
}

export async function fetchOfficialCardIdsPage(
  page: Page,
  productCode: string,
  pageNumber: number,
): Promise<{ cardIds: string[]; pageCount: number }> {
  await page.waitForTimeout(1000);
  const result = await page.evaluate(
    async ({ expectedProductCode, expectedPageNumber }) => {
      const body = new URLSearchParams();
      body.set('suggest', 'on');
      body.append('keyword_type[]', 'card_name');
      body.append('keyword_type[]', 'card_ruby');
      body.append('keyword_type[]', 'card_text');
      body.append('culture_cond[]', '単色');
      body.append('culture_cond[]', '多色');
      body.set('pagenum', String(expectedPageNumber));
      body.set('samename', 'show');
      body.set('products', expectedProductCode);
      body.set('sort', 'release_new');
      const response = await fetch('https://dm.takaratomy.co.jp/card/', {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'x-requested-with': 'XMLHttpRequest',
        },
        body: body.toString(),
      });
      const document = new DOMParser().parseFromString(
        await response.text(),
        'text/html',
      );
      return {
        ok: response.ok,
        status: response.status,
        cardIds: Array.from(
          document.querySelectorAll('a[href*="/card/detail/?id="]'),
        ).map((anchor) => {
          const href = anchor.getAttribute('href') ?? '';
          return new URL(href, 'https://dm.takaratomy.co.jp').searchParams.get(
            'id',
          );
        }),
        pageNumbers: Array.from(
          document.querySelectorAll('.wp-pagenavi [data-page]'),
        ).map((element) => element.getAttribute('data-page') ?? ''),
      };
    },
    {
      expectedProductCode: productCode,
      expectedPageNumber: pageNumber,
    },
  );
  if (!result.ok) {
    throw new Error(`商品別カード一覧の取得に失敗しました: ${result.status}`);
  }
  if (result.cardIds.some((cardId) => cardId === null)) {
    throw new Error('カードIDの抽出に失敗しました');
  }
  const cardIds = validateOfficialCardIds(
    result.cardIds.filter((cardId): cardId is string => cardId !== null),
    productCode,
  );
  const pageCount = Math.max(
    1,
    ...result.pageNumbers.map((page) => Number.parseInt(page, 10)),
  );
  return {
    cardIds,
    pageCount: Number.isNaN(pageCount) ? 1 : pageCount,
  };
}

export function extractOfficialCardName(
  fullName: string,
  packName: string,
): string {
  const name = fullName.replace(packName, '').trim();
  if (name === '') {
    throw new Error('カード名を抽出できませんでした');
  }
  return name;
}

export async function extractOfficialCardDetails(
  page: Page,
  cardId: string,
): Promise<{ name: string; image: Uint8Array }> {
  await page.waitForTimeout(1000);
  const url = `https://dm.takaratomy.co.jp/card/detail/?id=${encodeURIComponent(cardId)}`;
  const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
  if (response === null || !response.ok()) {
    throw new Error(
      `カード詳細の取得に失敗しました: ${response?.status() ?? '応答なし'}`,
    );
  }

  const cardName = page.locator('h3.card-name').first();
  await cardName.waitFor({ state: 'visible' });
  const packName =
    (await cardName.locator('span.packname').textContent()) ?? '';
  const name = extractOfficialCardName(
    (await cardName.textContent()) ?? '',
    packName,
  );
  const imageLocator: Locator = page.locator('.card-img img').first();
  await imageLocator.waitFor({ state: 'visible' });

  return {
    name,
    image: await imageLocator.screenshot({ type: 'png' }),
  };
}
