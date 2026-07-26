import { createFileRoute } from '@tanstack/react-router';
import {
  cardsQueryOptions,
  cardProductsQueryOptions,
} from '@/features/cards/api';
import { CardSearchContainer } from '@/features/cards/components/client/CardSearch/CardSearchContainer';

const initialFilters = { name: '', productCode: '' };

export const Route = createFileRoute('/_user/cards')({
  head: () => ({
    meta: [
      { title: 'カードを探す | DM Price Tracker' },
      { name: 'description', content: 'カードを検索して価格チェックを開始' },
    ],
  }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(cardsQueryOptions(initialFilters)),
      context.queryClient.ensureQueryData(cardProductsQueryOptions),
    ]);
  },
  component: CardSearchContainer,
});
