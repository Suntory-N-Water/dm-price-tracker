import {
  dehydrate,
  HydrationBoundary,
  QueryClient,
} from '@tanstack/react-query';
import {
  getAdminProductsServer,
  getAvailableAdminProductsServer,
} from '@/external/handler/admin-products/query.server';
import { adminProductKeys } from '@/features/admin-products/queries/keys';
import { AdminProductListContainer } from '../client/AdminProductList/AdminProductListContainer';

export async function AdminProductsPageTemplate() {
  const [products, available] = await Promise.all([
    getAdminProductsServer(),
    getAvailableAdminProductsServer(),
  ]);
  const queryClient = new QueryClient();
  queryClient.setQueryData(adminProductKeys.list, products);
  queryClient.setQueryData(adminProductKeys.available(''), available);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <AdminProductListContainer
        initialProducts={products.products}
        initialAvailableProducts={available.products}
      />
    </HydrationBoundary>
  );
}
