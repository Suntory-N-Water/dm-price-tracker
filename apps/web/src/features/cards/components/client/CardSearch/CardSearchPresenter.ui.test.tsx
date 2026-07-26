import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { CardSearchPresenter } from './CardSearchPresenter';

const cards = Array.from({ length: 19 }, (_, index) => ({
  id: `dm-card-${index + 1}`,
  name: `テストカード${index + 1}`,
  imageUrl: `/api/cards/dm-card-${index + 1}/image`,
  product: { code: '26ex2', name: 'カリスマBEST' },
  isWatching: false,
}));

describe('カード一覧', () => {
  it('19件ある時、次のページに進むと19件目だけ表示されること', async () => {
    const user = userEvent.setup();
    render(<CardSearchPresenter cards={cards} products={[]} />);

    expect(
      screen.getAllByRole('button', { name: '価格チェックを開始' }),
    ).toHaveLength(18);

    await user.click(screen.getByRole('button', { name: '次へ' }));

    expect(screen.getByText('テストカード19')).toBeVisible();
    expect(
      screen.getAllByRole('button', { name: '価格チェックを開始' }),
    ).toHaveLength(1);
  });
});
