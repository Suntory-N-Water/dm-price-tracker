import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CardSearchPresenter } from './CardSearchPresenter';

const cards = Array.from({ length: 18 }, (_, index) => ({
  id: `dm-card-${index + 1}`,
  name: `テストカード${index + 1}`,
  imageUrl: `/api/cards/dm-card-${index + 1}/image`,
  product: { code: '26ex2', name: 'カリスマBEST' },
  isWatching: false,
}));

const filters = { name: '', productCode: '', page: 1 };

describe('カード一覧', () => {
  it('次のページに進んだ時、次のページの取得を要求すること', async () => {
    const user = userEvent.setup();
    const onFiltersChange = vi.fn();
    render(
      <CardSearchPresenter
        cards={cards}
        pageCount={2}
        products={[]}
        filters={filters}
        onFiltersChange={onFiltersChange}
      />,
    );

    await user.click(screen.getByRole('button', { name: '次へ' }));

    expect(onFiltersChange).toHaveBeenCalledWith({
      name: '',
      productCode: '',
      page: 2,
    });
  });

  it('カード名を続けて入力した時、入力が止まってから1回だけ絞り込みを要求すること', async () => {
    const user = userEvent.setup();
    const onFiltersChange = vi.fn();
    render(
      <CardSearchPresenter
        cards={cards}
        pageCount={2}
        products={[]}
        filters={{ ...filters, page: 2 }}
        onFiltersChange={onFiltersChange}
      />,
    );

    await user.type(screen.getByLabelText('カード名で検索'), 'ドラゴン');

    await waitFor(() => {
      expect(onFiltersChange).toHaveBeenCalledTimes(1);
    });
    expect(onFiltersChange).toHaveBeenCalledWith({
      name: 'ドラゴン',
      productCode: '',
      page: 1,
    });
  });
});
