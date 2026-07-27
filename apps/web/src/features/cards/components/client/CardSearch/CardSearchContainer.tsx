import {
  useMutation,
  useQueryClient,
  useSuspenseQueries,
} from '@tanstack/react-query';
import {
  cardsQueryOptions,
  cardProductsQueryOptions,
  type CardFilters,
} from '@/features/cards/api';
import { startCardWatch, stopCardWatch } from '@/features/watches/api';
import { cardKeys } from '@/features/cards/queries/keys';
import { watchKeys } from '@/features/watches/queries/keys';
import type { Card } from '@/shared/api/types';
import { CardSearchPresenter } from './CardSearchPresenter';

export function CardSearchContainer({
  filters,
  onFiltersChange,
}: {
  filters: CardFilters;
  onFiltersChange: (filters: CardFilters) => void;
}) {
  const queryClient = useQueryClient();
  const [cards, products] = useSuspenseQueries({
    queries: [cardsQueryOptions(filters), cardProductsQueryOptions],
  });
  const mutation = useMutation({
    mutationFn: async (card: Card) => {
      if (card.isWatching) {
        await stopCardWatch(card.id);
      } else {
        await startCardWatch(card.id);
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: cardKeys.all }),
        queryClient.invalidateQueries({ queryKey: watchKeys.all }),
      ]);
    },
  });

  return (
    <CardSearchPresenter
      cards={cards.data.cards}
      pageCount={cards.data.pageCount}
      products={products.data.products}
      filters={filters}
      onFiltersChange={onFiltersChange}
      isPending={mutation.isPending}
      onToggle={(card) => mutation.mutateAsync(card).then(() => {})}
    />
  );
}
