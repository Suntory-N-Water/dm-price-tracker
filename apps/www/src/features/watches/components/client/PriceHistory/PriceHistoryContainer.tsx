'use client';

import { useQuery } from '@tanstack/react-query';
import type { PriceHistory } from '@/external/dto/api-schemas';
import { getPriceHistoryAction } from '@/external/handler/watches/query.action';
import { watchKeys } from '@/features/watches/queries/keys';
import { PriceHistoryPresenter } from './PriceHistoryPresenter';

export function PriceHistoryContainer({
  initialHistory,
  productName,
}: {
  initialHistory: PriceHistory;
  productName?: string;
}) {
  const history = useQuery({
    queryKey: watchKeys.detail(initialHistory.card.id),
    queryFn: () => getPriceHistoryAction(initialHistory.card.id),
    initialData: initialHistory,
  });

  return (
    <PriceHistoryPresenter history={history.data} productName={productName} />
  );
}
