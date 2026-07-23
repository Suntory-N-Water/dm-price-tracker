'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CardWatch, Product } from '@/external/dto/api-schemas';
import {
  addBulkExcludeKeywordAction,
  stopCardWatchAction,
  updateCardWatchAction,
} from '@/external/handler/watches/mutation.action';
import { getCardWatchesAction } from '@/external/handler/watches/query.action';
import { cardKeys } from '@/features/cards/queries/keys';
import { watchKeys } from '@/features/watches/queries/keys';
import { WatchListPresenter } from './WatchListPresenter';

export function WatchListContainer({
  initialWatches,
  products,
}: {
  initialWatches: CardWatch[];
  products: Product[];
}) {
  const queryClient = useQueryClient();
  const filters = { name: '', productCode: '' };
  const watches = useQuery({
    queryKey: watchKeys.list(filters),
    queryFn: () => getCardWatchesAction(filters),
    initialData: { watches: initialWatches },
  });
  const mutation = useMutation({
    mutationFn: async (operation: () => Promise<unknown>) => await operation(),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: watchKeys.all }),
        queryClient.invalidateQueries({ queryKey: cardKeys.all }),
      ]);
    },
  });

  return (
    <WatchListPresenter
      watches={watches.data.watches}
      products={products}
      isPending={mutation.isPending}
      onStop={(cardId) =>
        mutation.mutateAsync(() => stopCardWatchAction(cardId)).then(() => {})
      }
      onUpdate={(cardId, input) =>
        mutation
          .mutateAsync(() => updateCardWatchAction(cardId, input))
          .then(() => {})
      }
      onBulkExclude={(input) =>
        mutation.mutateAsync(() =>
          addBulkExcludeKeywordAction(input),
        ) as Promise<{
          updated: { cardId: string }[];
          skipped: { cardId: string; reason: string }[];
        }>
      }
    />
  );
}
