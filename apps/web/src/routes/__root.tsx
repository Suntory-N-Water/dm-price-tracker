import { QueryClientProvider } from '@tanstack/react-query';
import {
  HeadContent,
  Outlet,
  createRootRouteWithContext,
} from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';

import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools';
import { TanStackDevtools } from '@tanstack/react-devtools';

import {
  RouteError,
  RouteNotFound,
} from '@/shared/components/routing/RouteFeedback';
import '../globals.css';

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  head: () => ({
    meta: [
      { title: 'DM Price Tracker' },
      {
        name: 'description',
        content: 'デュエル・マスターズのカード価格を確認するアプリケーション',
      },
    ],
  }),
  component: RootComponent,
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
});

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <HeadContent />
      <Outlet />
      <TanStackDevtools
        config={{ position: 'bottom-right' }}
        plugins={[
          {
            name: 'TanStack Router',
            render: <TanStackRouterDevtoolsPanel />,
          },
        ]}
      />
    </QueryClientProvider>
  );
}
