import {
  useMutation,
  useQueryClient,
  useSuspenseQueries,
} from '@tanstack/react-query';
import {
  adminProductsQueryOptions,
  availableAdminProductsQueryOptions,
  crawlAdminProduct,
  crawlAdminProductCardDetails,
  syncAdminProducts,
} from '@/features/admin-products/api';
import { adminProductKeys } from '@/features/admin-products/queries/keys';
import { AdminProductListPresenter } from './AdminProductListPresenter';

export function AdminProductListContainer() {
  const queryClient = useQueryClient();
  const [products, available] = useSuspenseQueries({
    queries: [
      adminProductsQueryOptions,
      availableAdminProductsQueryOptions(''),
    ],
  });
  const mutation = useMutation({
    mutationFn: async (operation: () => Promise<unknown>) => await operation(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminProductKeys.all });
    },
  });

  return (
    <AdminProductListPresenter
      products={products.data.products}
      mercariCrawl={products.data.mercariCrawl}
      officialProductsCrawl={products.data.officialProductsCrawl}
      availableProducts={available.data.products}
      isPending={mutation.isPending}
      onSync={() => mutation.mutateAsync(syncAdminProducts).then(() => {})}
      onCrawl={(productCode) =>
        mutation
          .mutateAsync(() => crawlAdminProduct(productCode))
          .then(() => {})
      }
      onCardDetailsCrawl={(productCode) =>
        mutation
          .mutateAsync(() => crawlAdminProductCardDetails(productCode))
          .then(() => {})
      }
    />
  );
}
