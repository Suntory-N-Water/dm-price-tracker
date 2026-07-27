import { createFileRoute, notFound } from '@tanstack/react-router';
import * as v from 'valibot';
import { PriceHistoryContainer } from '@/features/watches/components/client/PriceHistory/PriceHistoryContainer';
import { priceHistoryQueryOptions } from '@/features/watches/api';
import { ApiError } from '@/shared/api/client';

const priceHistorySearchSchema = v.object({
  period: v.optional(v.picklist(['24h', '7d', '30d']), '7d'),
});

export const Route = createFileRoute('/_user/watches/$cardId')({
  head: () => ({
    meta: [
      { title: '価格履歴 | DM Price Tracker' },
      { name: 'description', content: 'カードの価格履歴' },
    ],
  }),
  validateSearch: priceHistorySearchSchema,
  loaderDeps: ({ search }) => ({ period: search.period }),
  loader: async ({ context, params, deps }) => {
    try {
      await context.queryClient.ensureQueryData(
        priceHistoryQueryOptions(params.cardId, deps.period),
      );
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
  const { period } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <PriceHistoryContainer
      cardId={cardId}
      period={period}
      onPeriodChange={(next) => navigate({ search: { period: next } })}
    />
  );
}
