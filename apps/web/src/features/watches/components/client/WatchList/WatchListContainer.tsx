import {
  useMutation,
  useQueryClient,
  useSuspenseQueries,
} from '@tanstack/react-query';
import { cardProductsQueryOptions } from '@/features/cards/api';
import {
  addBulkExcludeKeyword,
  stopCardWatch,
  updateCardWatch,
  watchesQueryOptions,
} from '@/features/watches/api';
import { cardKeys } from '@/features/cards/queries/keys';
import { watchKeys } from '@/features/watches/queries/keys';
import { WatchListPresenter } from './WatchListPresenter';

const initialFilters = { name: '', productCode: '' };

export function WatchListContainer() {
  const queryClient = useQueryClient();
  // useSuspenseQuery を並べると1本目のサスペンドで2本目が開始されず直列化する
  const [watches, products] = useSuspenseQueries({
    queries: [watchesQueryOptions(initialFilters), cardProductsQueryOptions],
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
  const bulkMutation = useMutation({
    mutationFn: addBulkExcludeKeyword,
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
      products={products.data.products}
      isPending={mutation.isPending || bulkMutation.isPending}
      onStop={(cardId) =>
        mutation.mutateAsync(() => stopCardWatch(cardId)).then(() => {})
      }
      onUpdate={(cardId, input) =>
        mutation
          .mutateAsync(() => updateCardWatch(cardId, input))
          .then(() => {})
      }
      onBulkExclude={(input) => bulkMutation.mutateAsync(input)}
    />
  );
}
