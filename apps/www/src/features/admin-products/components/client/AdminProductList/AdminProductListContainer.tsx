'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminProduct, Product } from '@/external/dto/api-schemas';
import {
  crawlAdminProductAction,
  syncAdminProductsAction,
} from '@/external/handler/admin-products/mutation.action';
import {
  getAdminProductsAction,
  getAvailableAdminProductsAction,
} from '@/external/handler/admin-products/query.action';
import { adminProductKeys } from '@/features/admin-products/queries/keys';
import { AdminProductListPresenter } from './AdminProductListPresenter';

export function AdminProductListContainer({
  initialProducts,
  initialAvailableProducts,
}: {
  initialProducts: AdminProduct[];
  initialAvailableProducts: Product[];
}) {
  const queryClient = useQueryClient();
  const products = useQuery({
    queryKey: adminProductKeys.list,
    queryFn: getAdminProductsAction,
    initialData: { products: initialProducts },
  });
  const available = useQuery({
    queryKey: adminProductKeys.available(''),
    queryFn: () => getAvailableAdminProductsAction(''),
    initialData: { products: initialAvailableProducts },
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
      availableProducts={available.data.products}
      isPending={mutation.isPending}
      onSync={() =>
        mutation.mutateAsync(syncAdminProductsAction) as Promise<{
          syncedCount: number;
        }>
      }
      onCrawl={(productCode) =>
        mutation
          .mutateAsync(() => crawlAdminProductAction(productCode))
          .then(() => {})
      }
    />
  );
}
