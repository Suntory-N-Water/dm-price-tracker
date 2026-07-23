import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { WatchListPresenter } from './WatchListPresenter';

const watches = [
  {
    card: {
      id: 'dm26ex2-001',
      name: 'ボルシャック・ドラゴン',
      imageUrl: '/api/cards/dm26ex2-001/image',
      product: { code: '26ex2', name: 'カリスマBEST' },
    },
    additionalKeywords: [],
    commonExcludeKeywords: ['まとめ'],
    cardExcludeKeywords: [],
    currentPrice: 3480,
    crawledAt: '2026-07-23 12:00:00',
  },
  {
    card: {
      id: 'dm26rp2-001',
      name: '聖霊龍王 メルヴェイユ',
      imageUrl: '/api/cards/dm26rp2-001/image',
      product: { code: '26rp2', name: '王道W 第2弾' },
    },
    additionalKeywords: [],
    commonExcludeKeywords: ['まとめ'],
    cardExcludeKeywords: [],
    currentPrice: null,
    crawledAt: null,
  },
];

describe('価格チェック中一覧', () => {
  it('カード名を入力した時、一致するカードだけ表示されること', async () => {
    const user = userEvent.setup();
    render(<WatchListPresenter watches={watches} products={[]} />);

    await user.type(screen.getByRole('searchbox'), 'メルヴェイユ');

    expect(screen.getByText('聖霊龍王 メルヴェイユ')).toBeVisible();
    expect(screen.queryByText('ボルシャック・ドラゴン')).toBeNull();
  });

  it('カードを選択した時、一括除外ワード操作が表示されること', async () => {
    const user = userEvent.setup();
    render(<WatchListPresenter watches={watches} products={[]} />);

    await user.click(
      screen.getByRole('checkbox', {
        name: 'ボルシャック・ドラゴンを選択',
      }),
    );

    expect(
      screen.getByRole('button', {
        name: '選択したカードに除外ワードを追加',
      }),
    ).toBeVisible();
  });

  it('利用者一覧の時、管理者の商品操作が表示されないこと', () => {
    render(<WatchListPresenter watches={watches} products={[]} />);

    expect(screen.queryByText('商品を追加')).toBeNull();
    expect(screen.queryByText('商品一覧を更新')).toBeNull();
  });

  it('一括除外ワードを追加した時、変更できたカードとスキップしたカードを一覧で確認できること', async () => {
    const user = userEvent.setup();
    render(
      <WatchListPresenter
        watches={watches}
        products={[]}
        onBulkExclude={async () => ({
          updated: [{ cardId: 'dm26ex2-001' }],
          skipped: [
            {
              cardId: 'dm26rp2-001',
              reason: '除外ワードの空き枠がありません',
            },
          ],
        })}
      />,
    );
    await user.click(
      screen.getByRole('checkbox', {
        name: 'ボルシャック・ドラゴンを選択',
      }),
    );
    await user.click(
      screen.getByRole('checkbox', {
        name: '聖霊龍王 メルヴェイユを選択',
      }),
    );
    await user.click(
      screen.getByRole('button', {
        name: '選択したカードに除外ワードを追加',
      }),
    );
    await user.type(
      screen.getByRole('textbox', { name: '追加する除外ワード' }),
      'サイン入り',
    );

    await user.click(screen.getByRole('button', { name: '2枚に追加する' }));

    const result = within(screen.getByRole('status'));
    expect(result.getByText('ボルシャック・ドラゴン')).toBeVisible();
    expect(result.getByText('聖霊龍王 メルヴェイユ')).toBeVisible();
    expect(result.getByText('除外ワードの空き枠がありません')).toBeVisible();
  });
});
