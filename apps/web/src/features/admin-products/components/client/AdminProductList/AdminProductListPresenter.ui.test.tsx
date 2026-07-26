import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { AdminProductListPresenter } from './AdminProductListPresenter';

describe('管理商品一覧', () => {
  it('取得状態が異なる商品の時、完了・取得中・失敗を区別して表示すること', () => {
    render(
      <AdminProductListPresenter
        products={[
          {
            code: '26ex2',
            name: 'カリスマBEST',
            cardIdCrawl: {
              status: 'COMPLETED',
              updatedAt: '2026-07-23 10:00:00',
              error: null,
            },
            cardDetailsCrawl: {
              status: 'COMPLETED',
              updatedAt: '2026-07-23 10:30:00',
              error: null,
            },
            pendingCardCount: 0,
          },
          {
            code: '26rp2',
            name: '王道W 第2弾',
            cardIdCrawl: {
              status: 'RUNNING',
              updatedAt: '2026-07-23 11:00:00',
              error: null,
            },
            cardDetailsCrawl: null,
            pendingCardCount: 3,
          },
          {
            code: '25ex4',
            name: '鬼レヴォリューション',
            cardIdCrawl: {
              status: 'FAILED',
              updatedAt: '2026-07-23 09:00:00',
              error: '取得に失敗しました',
            },
            cardDetailsCrawl: {
              status: 'PARTIALLY_FAILED',
              updatedAt: '2026-07-23 09:30:00',
              error: '一部の詳細を取得できませんでした',
            },
            pendingCardCount: 2,
          },
        ]}
        mercariCrawl={{
          status: 'FAILED',
          updatedAt: '2026-07-23 12:00:00',
          error: '価格の取得に失敗しました',
        }}
      />,
    );

    expect(screen.getAllByText('完了')).toHaveLength(2);
    expect(screen.getAllByText('取得中')).toHaveLength(1);
    expect(screen.getAllByText('失敗')).toHaveLength(2);
    expect(screen.getByText('一部失敗')).toBeVisible();
    expect(screen.getByText('3件')).toBeVisible();
    expect(screen.getByRole('button', { name: '再取得' })).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'カード詳細収集を開始' }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: '詳細を再取得' })).toBeVisible();
    expect(screen.getByText('価格の取得に失敗しました')).toBeVisible();
    expect(screen.getByText('2026年7月23日 19:00')).toBeVisible();
    expect(screen.getByText('2026年7月23日 20:00')).toBeVisible();
    expect(screen.getByText('2026年7月23日 18:00')).toBeVisible();
  });

  it('追加商品を選択した時、選択状態を意味と見た目の両方で示すこと', async () => {
    const user = userEvent.setup();
    render(
      <AdminProductListPresenter
        products={[]}
        availableProducts={[
          {
            code: '26ex2',
            name: 'DM26-EX2 悪感謝祭 カリスマBEST',
          },
        ]}
      />,
    );

    await user.click(screen.getByRole('button', { name: '商品を追加' }));
    const product = screen.getByRole('button', {
      name: /DM26-EX2 悪感謝祭 カリスマBEST/u,
    });
    await user.click(product);

    expect(product).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('選択中')).toBeVisible();
  });
});
