import { createFileRoute } from '@tanstack/react-router';
import { cardProductsQueryOptions } from '@/features/cards/api';
import { WatchListContainer } from '@/features/watches/components/client/WatchList/WatchListContainer';
import { watchesQueryOptions } from '@/features/watches/api';

const initialFilters = { name: '', productCode: '' };

export const Route = createFileRoute('/_user/watches/')({
  head: () => ({
    meta: [
      { title: '価格チェック中 | DM Price Tracker' },
      { name: 'description', content: '価格チェック中のカード一覧' },
    ],
  }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(watchesQueryOptions(initialFilters)),
      context.queryClient.ensureQueryData(cardProductsQueryOptions),
    ]);
  },
  component: WatchListContainer,
});
