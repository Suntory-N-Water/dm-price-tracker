import { useSuspenseQuery } from '@tanstack/react-query';
import {
  priceHistoryQueryOptions,
  type PriceHistoryPeriod,
} from '@/features/watches/api';
import { PriceHistoryPresenter } from './PriceHistoryPresenter';

export function PriceHistoryContainer({
  cardId,
  period,
  onPeriodChange,
}: {
  cardId: string;
  period: PriceHistoryPeriod;
  onPeriodChange: (period: PriceHistoryPeriod) => void;
}) {
  const history = useSuspenseQuery(priceHistoryQueryOptions(cardId, period));

  return (
    <PriceHistoryPresenter
      history={history.data}
      period={period}
      onPeriodChange={onPeriodChange}
    />
  );
}
