import { createFileRoute, notFound } from '@tanstack/react-router';
import { PriceHistoryContainer } from '@/features/watches/components/client/PriceHistory/PriceHistoryContainer';
import {
  priceHistoryQueryOptions,
  watchesQueryOptions,
} from '@/features/watches/api';
import { ApiError } from '@/shared/api/client';

const initialFilters = { name: '', productCode: '' };

export const Route = createFileRoute('/_user/watches/$cardId')({
  head: () => ({
    meta: [
      { title: '価格履歴 | DM Price Tracker' },
      { name: 'description', content: 'カードの価格履歴' },
    ],
  }),
  loader: async ({ context, params }) => {
    try {
      await Promise.all([
        context.queryClient.ensureQueryData(
          priceHistoryQueryOptions(params.cardId),
        ),
        context.queryClient.ensureQueryData(
          watchesQueryOptions(initialFilters),
        ),
      ]);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        throw notFound();
      }
      throw error;
    }
  },
  component: PriceHistoryRoute,
  notFoundComponent: () => (
    <p className='p-8 text-center font-semibold'>
      価格チェック中のカードが見つかりません
    </p>
  ),
});

function PriceHistoryRoute() {
  const { cardId } = Route.useParams();
  return <PriceHistoryContainer cardId={cardId} />;
}
