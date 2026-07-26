import { createRouter as createTanStackRouter } from '@tanstack/react-router';
import { QueryClient } from '@tanstack/react-query';
import { routeTree } from './routeTree.gen';

export const queryClient = new QueryClient();

export const router = createTanStackRouter({
  routeTree,
  context: { queryClient },
  scrollRestoration: true,
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0,
});

declare module '@tanstack/react-router' {
  // biome-ignore lint/style/useConsistentTypeDefinitions: TanStack Routerの宣言マージにinterfaceが必要
  interface Register {
    router: typeof router;
  }
}
