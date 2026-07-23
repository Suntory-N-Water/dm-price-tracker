import {
  dehydrate,
  HydrationBoundary,
  QueryClient,
} from '@tanstack/react-query';
import {
  getCardsServer,
  getCardProductsServer,
} from '@/external/handler/cards/query.server';
import { cardKeys } from '@/features/cards/queries/keys';
import { CardSearchContainer } from '../client/CardSearch/CardSearchContainer';

export async function CardSearchPageTemplate() {
  const filters = { name: '', productCode: '' };
  const [cardResponse, productResponse] = await Promise.all([
    getCardsServer(filters),
    getCardProductsServer(),
  ]);
  const queryClient = new QueryClient();
  queryClient.setQueryData(cardKeys.list(filters), cardResponse);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <CardSearchContainer
        initialCards={cardResponse.cards}
        products={productResponse.products}
      />
    </HydrationBoundary>
  );
}
