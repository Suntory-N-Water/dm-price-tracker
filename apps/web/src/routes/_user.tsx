import { Outlet, createFileRoute } from '@tanstack/react-router';
import { AppLayout } from '@/shared/components/layout/AppLayout';
import {
  RouteError,
  RoutePending,
} from '@/shared/components/routing/RouteFeedback';

export const Route = createFileRoute('/_user')({
  component: UserLayout,
  pendingComponent: RoutePending,
  errorComponent: RouteError,
});

function UserLayout() {
  return (
    <AppLayout userType='user'>
      <Outlet />
    </AppLayout>
  );
}
