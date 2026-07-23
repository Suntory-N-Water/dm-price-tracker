import {
  dehydrate,
  HydrationBoundary,
  QueryClient,
} from '@tanstack/react-query';
import {
  getCardWatchesServer,
  getProductsServer,
} from '@/external/handler/watches/query.server';
import { watchKeys } from '@/features/watches/queries/keys';
import { WatchListContainer } from '../client/WatchList/WatchListContainer';

export async function WatchListPageTemplate() {
  const filters = { name: '', productCode: '' };
  const [watchResponse, productResponse] = await Promise.all([
    getCardWatchesServer(filters),
    getProductsServer(),
  ]);
  const queryClient = new QueryClient();
  queryClient.setQueryData(watchKeys.list(filters), watchResponse);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <WatchListContainer
        initialWatches={watchResponse.watches}
        products={productResponse.products}
      />
    </HydrationBoundary>
  );
}
