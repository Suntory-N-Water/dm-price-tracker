import { createFileRoute } from '@tanstack/react-router';
import * as v from 'valibot';
import {
  cardsQueryOptions,
  cardProductsQueryOptions,
} from '@/features/cards/api';
import { CardSearchContainer } from '@/features/cards/components/client/CardSearch/CardSearchContainer';

const cardSearchSchema = v.object({
  name: v.optional(v.string(), ''),
  productCode: v.optional(v.string(), ''),
  page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
});

export const Route = createFileRoute('/_user/cards')({
  head: () => ({
    meta: [
      { title: 'カードを探す | DM Price Tracker' },
      { name: 'description', content: 'カードを検索して価格チェックを開始' },
    ],
  }),
  validateSearch: cardSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(cardsQueryOptions(deps)),
      context.queryClient.ensureQueryData(cardProductsQueryOptions),
    ]);
  },
  component: CardSearchRoute,
});

function CardSearchRoute() {
  const filters = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <CardSearchContainer
      filters={filters}
      onFiltersChange={(next) => navigate({ search: next })}
    />
  );
}
