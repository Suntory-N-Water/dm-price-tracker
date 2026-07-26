import { createFileRoute } from '@tanstack/react-router';
import {
  adminProductsQueryOptions,
  availableAdminProductsQueryOptions,
} from '@/features/admin-products/api';
import { AdminProductListContainer } from '@/features/admin-products/components/client/AdminProductList/AdminProductListContainer';

export const Route = createFileRoute('/admin/products')({
  head: () => ({
    meta: [
      { title: '商品管理 | DM Price Tracker' },
      { name: 'description', content: '商品とクローラー状態の管理' },
    ],
  }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(adminProductsQueryOptions),
      context.queryClient.ensureQueryData(
        availableAdminProductsQueryOptions(''),
      ),
    ]);
  },
  component: AdminProductListContainer,
});
