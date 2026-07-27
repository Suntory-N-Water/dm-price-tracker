import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithRouter } from '@/test-utils/render-with-router';
import { RouteError } from './RouteFeedback';

describe('loader error', () => {
  it('再試行した時、Query error boundaryとroute loaderを再実行すること', async () => {
    const queryClient = new QueryClient();
    const reset = vi.fn();
    const user = userEvent.setup();
    const view = renderWithRouter(
      <QueryClientProvider client={queryClient}>
        <RouteError error={new Error('読み込みに失敗しました')} reset={reset} />
      </QueryClientProvider>,
    );
    const invalidate = vi
      .spyOn(view.router, 'invalidate')
      .mockResolvedValue(undefined);

    await user.click(screen.getByRole('button', { name: '再試行' }));

    expect(reset).toHaveBeenCalledOnce();
    expect(invalidate).toHaveBeenCalledOnce();
  });
});
