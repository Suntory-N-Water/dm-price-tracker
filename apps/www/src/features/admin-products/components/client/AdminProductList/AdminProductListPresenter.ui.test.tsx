import { render, screen } from '@testing-library/react';
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
            status: 'FINISHED',
            updatedAt: '2026-07-23 10:00:00',
            error: null,
          },
          {
            code: '26rp2',
            name: '王道W 第2弾',
            status: 'RUNNING',
            updatedAt: '2026-07-23 11:00:00',
            error: null,
          },
          {
            code: '25ex4',
            name: '鬼レヴォリューション',
            status: 'ABORTED',
            updatedAt: '2026-07-23 09:00:00',
            error: '取得に失敗しました',
          },
        ]}
      />,
    );

    expect(screen.getByText('完了')).toBeVisible();
    expect(screen.getByText('取得中')).toBeVisible();
    expect(screen.getByText('失敗')).toBeVisible();
    expect(screen.getByRole('button', { name: '再取得' })).toBeVisible();
  });
});
