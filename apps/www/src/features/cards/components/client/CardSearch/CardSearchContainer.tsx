'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Card, Product } from '@/external/dto/api-schemas';
import { getCardsAction } from '@/external/handler/cards/query.action';
import {
  startCardWatchAction,
  stopCardWatchAction,
} from '@/external/handler/watches/mutation.action';
import { cardKeys } from '@/features/cards/queries/keys';
import { watchKeys } from '@/features/watches/queries/keys';
import { CardSearchPresenter } from './CardSearchPresenter';

export function CardSearchContainer({
  initialCards,
  products,
}: {
  initialCards: Card[];
  products: Product[];
}) {
  const queryClient = useQueryClient();
  const filters = { name: '', productCode: '' };
  const cards = useQuery({
    queryKey: cardKeys.list(filters),
    queryFn: () => getCardsAction(filters),
    initialData: { cards: initialCards },
  });
  const mutation = useMutation({
    mutationFn: async (card: Card) => {
      if (card.isWatching) {
        await stopCardWatchAction(card.id);
      } else {
        await startCardWatchAction(card.id);
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
      products={products}
      isPending={mutation.isPending}
      onToggle={(card) => mutation.mutateAsync(card).then(() => {})}
    />
  );
}
