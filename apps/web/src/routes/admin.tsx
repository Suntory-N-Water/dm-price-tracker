import { Outlet, createFileRoute, redirect } from '@tanstack/react-router';
import { adminProductsQueryOptions } from '@/features/admin-products/api';
import { ApiError } from '@/shared/api/client';
import { AppLayout } from '@/shared/components/layout/AppLayout';
import {
  RouteError,
  RoutePending,
} from '@/shared/components/routing/RouteFeedback';

export const Route = createFileRoute('/admin')({
  loader: async ({ context }) => {
    try {
      await context.queryClient.ensureQueryData(adminProductsQueryOptions);
    } catch (error) {
      if (
        error instanceof ApiError &&
        (error.status === 401 || error.status === 403)
      ) {
        throw redirect({ to: '/watches' });
      }
      throw error;
    }
  },
  component: AdminLayout,
  pendingComponent: RoutePending,
  errorComponent: RouteError,
});

function AdminLayout() {
  return (
    <AppLayout userType='admin'>
      <Outlet />
    </AppLayout>
  );
}
