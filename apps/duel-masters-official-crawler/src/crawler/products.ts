import { parseHTML } from 'linkedom';

export type OfficialProduct = {
  code: string;
  name: string;
  displayOrder: number;
};

export function extractProducts(html: string): OfficialProduct[] {
  const { document } = parseHTML(html);
  const products = new Map<string, OfficialProduct>();

  for (const option of document.querySelectorAll(
    'select[name="products"] option[value]',
  )) {
    const code = option.getAttribute('value')?.trim() ?? '';
    const name = option.textContent?.trim() ?? '';
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
