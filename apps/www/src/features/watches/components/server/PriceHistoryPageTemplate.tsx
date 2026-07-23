import {
  dehydrate,
  HydrationBoundary,
  QueryClient,
} from '@tanstack/react-query';
import {
  getCardWatchesServer,
  getPriceHistoryServer,
} from '@/external/handler/watches/query.server';
import { watchKeys } from '@/features/watches/queries/keys';
import { PriceHistoryContainer } from '../client/PriceHistory/PriceHistoryContainer';

export async function PriceHistoryPageTemplate({ cardId }: { cardId: string }) {
  const [history, watches] = await Promise.all([
    getPriceHistoryServer(cardId),
    getCardWatchesServer(),
  ]);
  const productName = watches.watches.find((watch) => watch.card.id === cardId)
    ?.card.product.name;
  const queryClient = new QueryClient();
  queryClient.setQueryData(watchKeys.detail(cardId), history);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <PriceHistoryContainer
        initialHistory={history}
        productName={productName}
      />
    </HydrationBoundary>
  );
}
