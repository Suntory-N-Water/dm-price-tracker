import { parseHTML } from 'linkedom';
import * as v from 'valibot';

export const LIST_KIND = 'LIST';
export const DETAIL_KIND = 'DETAIL';

export const listJobMetaSchema = v.object({
  productCode: v.string(),
});

export const detailJobMetaSchema = v.object({
  productCode: v.string(),
  productName: v.string(),
  cardId: v.string(),
});

export const duelMastersOfficialRecordSchema = v.object({
  id: v.string(),
  productCode: v.string(),
  productName: v.string(),
  name: v.string(),
  imageKey: v.string(),
});

export function extractListPage(
  html: string,
  expectedProductCode: string,
): { cardIds: string[]; pageCount: number } {
  const { document } = parseHTML(html);
  const extractedCardIds = Array.from(
    document.querySelectorAll('a[href*="/card/detail/?id="]'),
  ).map((anchor) => {
    const href = anchor.getAttribute('href') ?? '';
    return new URL(href, 'https://dm.takaratomy.co.jp').searchParams.get('id');
  });
  if (extractedCardIds.some((cardId) => cardId === null)) {
    throw new Error('カードIDの抽出に失敗しました');
  }
  const cardIds = extractedCardIds.filter(
    (cardId): cardId is string => cardId !== null,
  );
  if (
    cardIds.some(
      (cardId) =>
        !cardId.startsWith(`${expectedProductCode}-`) &&
        !cardId.startsWith(`dm${expectedProductCode}-`),
    )
  ) {
    throw new Error(
      `商品コードの絞り込みに失敗しました: ${expectedProductCode}`,
    );
  }

  const pageCount = Math.max(
    1,
    ...Array.from(document.querySelectorAll('.wp-pagenavi [data-page]')).map(
      (element) => Number.parseInt(element.getAttribute('data-page') ?? '', 10),
    ),
  );

  return {
    cardIds: [...new Set(cardIds)],
    pageCount: Number.isNaN(pageCount) ? 1 : pageCount,
  };
}

export function extractProductName(
  html: string,
  expectedProductCode: string,
): string {
  const { document } = parseHTML(html);
  const productName = Array.from(
    document.querySelectorAll('select[name="products"] option'),
  )
    .find((option) => option.getAttribute('value') === expectedProductCode)
    ?.textContent?.trim();
  if (productName === undefined || productName === '') {
    throw new Error(`商品コードが見つかりません: ${expectedProductCode}`);
  }
  return productName;
}
