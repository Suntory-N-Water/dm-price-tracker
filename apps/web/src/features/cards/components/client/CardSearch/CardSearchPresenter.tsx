import {
  Check,
  ChevronLeft,
  ChevronRight,
  Search,
  TrendingUp,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { CardFilters } from '@/features/cards/api';
import type { Card as CardType, Product } from '@/shared/api/types';
import { Button } from '@/shared/components/ui/button';
import { Card } from '@/shared/components/ui/card';
import { Input } from '@/shared/components/ui/input';

const searchDebounceMs = 300;

export function CardSearchPresenter({
  cards,
  pageCount,
  products,
  filters,
  onFiltersChange,
  isPending = false,
  onToggle,
}: {
  cards: CardType[];
  pageCount: number;
  products: Product[];
  filters: CardFilters;
  onFiltersChange: (filters: CardFilters) => void;
  isPending?: boolean;
  onToggle?: (card: CardType) => Promise<void>;
}) {
  const [name, setName] = useState(filters.name);
  const [error, setError] = useState('');
  // 1文字ごとにサーバーへ問い合わせないよう、入力が落ち着いてから絞り込む
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(debounceRef.current), []);

  return (
    <div className='space-y-6'>
      <h1 className='text-3xl font-bold tracking-tight'>カードを探す</h1>
      <div className='flex flex-col gap-3 lg:flex-row'>
        <label className='relative block max-w-xl flex-1' htmlFor='card-search'>
          <Search className='absolute left-3 top-3 size-4 text-stone-400' />
          <span className='sr-only'>カード名で検索</span>
          <Input
            id='card-search'
            type='search'
            value={name}
            onChange={(event) => {
              const nextName = event.target.value;
              setName(nextName);
              clearTimeout(debounceRef.current);
              debounceRef.current = setTimeout(
                () =>
                  onFiltersChange({
                    ...filters,
                    name: nextName.trim(),
                    page: 1,
                  }),
                searchDebounceMs,
              );
            }}
            placeholder='カード名で検索'
            className='pl-9'
          />
        </label>
        <select
          value={filters.productCode}
          onChange={(event) => {
            onFiltersChange({
              ...filters,
              productCode: event.target.value,
              page: 1,
            });
          }}
          className='h-10 rounded-md border border-stone-300 bg-white px-3 text-sm'
          aria-label='商品で絞り込む'
        >
          <option value=''>すべての商品</option>
          {products.map((product) => (
            <option key={product.code} value={product.code}>
              {product.name}
            </option>
          ))}
        </select>
      </div>
      {error !== '' && (
        <p
          className='rounded-lg bg-red-50 p-3 text-sm text-red-800'
          role='alert'
        >
          {error}
        </p>
      )}
      {cards.length === 0 ? (
        <Card className='grid min-h-56 place-items-center p-8 text-center font-semibold'>
          条件に合うカードはありません
        </Card>
      ) : (
        <>
          <div className='grid gap-5 sm:grid-cols-2 xl:grid-cols-3'>
            {cards.map((card, index) => (
              <Card key={card.id} className='overflow-hidden'>
                <div className='grid h-88 place-items-center border-b border-stone-200 bg-[var(--surface-ceramic)] p-4'>
                  <div className='relative aspect-[5/7] h-80 max-w-full overflow-hidden rounded-lg shadow-[0_1px_1px_rgba(0,0,0,0.18),0_6px_14px_rgba(0,0,0,0.10)]'>
                    <img
                      src={card.imageUrl}
                      alt={`${card.name}のカード画像`}
                      width={240}
                      height={336}
                      crossOrigin='use-credentials'
                      loading={
                        filters.page === 1 && index < 3 ? 'eager' : 'lazy'
                      }
                      className='h-full w-full object-contain'
                    />
                  </div>
                </div>
                <div className='space-y-3 p-4'>
                  <div>
                    <h2 className='min-h-8 font-bold leading-snug'>
                      {card.name}
                    </h2>
                    <p className='mt-1 text-xs text-stone-500'>
                      {card.product.name}
                    </p>
                  </div>
                  <Button
                    className='w-full'
                    variant={card.isWatching ? 'outline' : 'default'}
                    disabled={isPending}
                    onClick={async () => {
                      setError('');
                      try {
                        await onToggle?.(card);
                      } catch (caught) {
                        setError(
                          caught instanceof Error
                            ? caught.message
                            : '価格チェックを変更できませんでした',
                        );
                      }
                    }}
                  >
                    {card.isWatching ? (
                      <>
                        <Check className='size-4' />
                        価格チェック中
                      </>
                    ) : (
                      <>
                        <TrendingUp className='size-4' />
                        価格チェックを開始
                      </>
                    )}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
          {pageCount > 1 && (
            <nav
              className='flex items-center justify-center gap-3 pt-2'
              aria-label='カード一覧のページ'
            >
              <Button
                variant='outline'
                className='h-11 min-w-11 px-3'
                disabled={filters.page === 1}
                onClick={() =>
                  onFiltersChange({ ...filters, page: filters.page - 1 })
                }
              >
                <ChevronLeft className='size-4' />
                前へ
              </Button>
              <p className='min-w-24 text-center text-sm font-semibold text-stone-700'>
                {filters.page} / {pageCount} ページ
              </p>
              <Button
                variant='outline'
                className='h-11 min-w-11 px-3'
                disabled={filters.page === pageCount}
                onClick={() =>
                  onFiltersChange({ ...filters, page: filters.page + 1 })
                }
              >
                次へ
                <ChevronRight className='size-4' />
              </Button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
