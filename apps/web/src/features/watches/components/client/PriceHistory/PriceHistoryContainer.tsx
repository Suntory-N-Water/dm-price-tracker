import { useSuspenseQueries } from '@tanstack/react-query';
import {
  priceHistoryQueryOptions,
  watchesQueryOptions,
} from '@/features/watches/api';
import { PriceHistoryPresenter } from './PriceHistoryPresenter';

const initialFilters = { name: '', productCode: '' };

export function PriceHistoryContainer({ cardId }: { cardId: string }) {
  const [history, watches] = useSuspenseQueries({
    queries: [
      priceHistoryQueryOptions(cardId),
      watchesQueryOptions(initialFilters),
    ],
  });
  const productName = watches.data.watches.find(
    (watch) => watch.card.id === cardId,
  )?.card.product.name;

  return (
    <PriceHistoryPresenter history={history.data} productName={productName} />
  );
}
