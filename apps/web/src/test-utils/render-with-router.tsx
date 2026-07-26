import {
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { render as testingLibraryRender } from '@testing-library/react';
import type { ReactNode } from 'react';

export function renderWithRouter(ui: ReactNode) {
  const rootRoute = createRootRoute();
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => ui,
  });
  const cardsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/cards',
    component: () => null,
  });
  const watchesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/watches',
    component: () => null,
  });
  const watchRoute = createRoute({
    getParentRoute: () => watchesRoute,
    path: '$cardId',
    component: () => null,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      indexRoute,
      cardsRoute,
      watchesRoute.addChildren([watchRoute]),
    ]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });

  const result = testingLibraryRender(
    <RouterContextProvider router={router}>{ui}</RouterContextProvider>,
  );
  return { ...result, router };
}
