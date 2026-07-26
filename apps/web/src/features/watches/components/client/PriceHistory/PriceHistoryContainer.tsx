import { useSuspenseQuery } from '@tanstack/react-query';
import {
  priceHistoryQueryOptions,
  watchesQueryOptions,
} from '@/features/watches/api';
import { PriceHistoryPresenter } from './PriceHistoryPresenter';

export function PriceHistoryContainer({ cardId }: { cardId: string }) {
  const history = useSuspenseQuery(priceHistoryQueryOptions(cardId));
  const watches = useSuspenseQuery(
    watchesQueryOptions({ name: '', productCode: '' }),
  );
  const productName = watches.data.watches.find(
    (watch) => watch.card.id === cardId,
  )?.card.product.name;

  return (
    <PriceHistoryPresenter history={history.data} productName={productName} />
  );
}
