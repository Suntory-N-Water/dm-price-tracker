export type PriceItem = {
  title: string;
  price: number;
};

export function calculateMedianUnitPrice(
  items: readonly PriceItem[],
): number | undefined {
  if (items.length === 0) {
    return;
  }

  const unitPrices = items
    .map(({ title, price }) => {
      const countText = title.normalize('NFKC').match(/(\d+)\s*枚/u)?.[1];
      const count =
        countText === undefined ? 1 : Number.parseInt(countText, 10);

      return price / (count > 0 ? count : 1);
    })
    .sort((left, right) => left - right);
  const middle = Math.floor(unitPrices.length / 2);
  const median =
    unitPrices.length % 2 === 0
      ? ((unitPrices[middle - 1] ?? 0) + (unitPrices[middle] ?? 0)) / 2
      : (unitPrices[middle] ?? 0);

  return Math.round(median);
}
