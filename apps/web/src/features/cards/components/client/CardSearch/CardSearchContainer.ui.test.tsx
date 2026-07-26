import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cardsQueryOptions,
  cardProductsQueryOptions,
} from '@/features/cards/api';
import { cardKeys } from '@/features/cards/queries/keys';
import { watchKeys } from '@/features/watches/queries/keys';
import { renderWithRouter } from '@/test-utils/render-with-router';
import { CardSearchContainer } from './CardSearchContainer';

describe('カード検索の更新', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('価格チェックを開始した時、カードと価格チェック一覧を再取得すること', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { staleTime: Number.POSITIVE_INFINITY } },
    });
    queryClient.setQueryData(
      cardsQueryOptions({ name: '', productCode: '' }).queryKey,
      {
        cards: [
          {
            id: 'dm26ex2-001',
            name: 'ボルシャック・ドラゴン',
            imageUrl: 'http://api.test/api/cards/dm26ex2-001/image',
            product: { code: '26ex2', name: 'カリスマBEST' },
            isWatching: false,
          },
        ],
      },
    );
    queryClient.setQueryData(cardProductsQueryOptions.queryKey, {
      products: [{ code: '26ex2', name: 'カリスマBEST' }],
    });
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          {
            cardId: 'dm26ex2-001',
            additionalKeywords: [],
            commonExcludeKeywords: [],
            cardExcludeKeywords: [],
          },
          { status: 201 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithRouter(
      <QueryClientProvider client={queryClient}>
        <CardSearchContainer />
      </QueryClientProvider>,
    );

    await user.click(
      screen.getByRole('button', { name: '価格チェックを開始' }),
    );

    await waitFor(() => {
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: cardKeys.all,
      });
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: watchKeys.all,
      });
    });
  });
});
