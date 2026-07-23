import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { PriceHistoryPresenter } from './PriceHistoryPresenter';

const history = {
  card: {
    id: 'dm26ex2-001',
    name: 'ボルシャック・ドラゴン',
    imageUrl: '/api/cards/dm26ex2-001/image',
  },
  currentPrice: 3480,
  pricePoints: [
    {
      crawledAt: '2026-07-19 12:00:00',
      price: 3200,
      screenshotUrl: null,
    },
    {
      crawledAt: '2026-07-23 12:00:00',
      price: 3480,
      screenshotUrl:
        '/api/card-watches/dm26ex2-001/screenshots/2026-07-23%2012%3A00%3A00',
    },
  ],
};

describe('価格詳細', () => {
  it('古い価格点を選んだ時、日時と価格と画像欠損表示が連動すること', async () => {
    const user = userEvent.setup();
    render(<PriceHistoryPresenter history={history} />);

    await user.click(
      screen.getByRole('button', {
        name: '2026年7月19日 12:00、3,200円',
      }),
    );

    expect(screen.getByText('2026年7月19日 12:00')).toBeVisible();
    expect(screen.getAllByText('¥3,200')).toHaveLength(2);
    expect(
      screen.getByText('この時点の検索結果画像は残っていません'),
    ).toBeVisible();
  });
});
