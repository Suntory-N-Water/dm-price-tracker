import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import {
  cardsQueryOptions,
  cardProductsQueryOptions,
} from '@/features/cards/api';
import { startCardWatch, stopCardWatch } from '@/features/watches/api';
import { cardKeys } from '@/features/cards/queries/keys';
import { watchKeys } from '@/features/watches/queries/keys';
import type { Card } from '@/shared/api/types';
import { CardSearchPresenter } from './CardSearchPresenter';

const initialFilters = { name: '', productCode: '' };

export function CardSearchContainer() {
  const queryClient = useQueryClient();
  const cards = useSuspenseQuery(cardsQueryOptions(initialFilters));
  const products = useSuspenseQuery(cardProductsQueryOptions);
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
      products={products.data.products}
      isPending={mutation.isPending}
      onToggle={(card) => mutation.mutateAsync(card).then(() => {})}
    />
  );
}
