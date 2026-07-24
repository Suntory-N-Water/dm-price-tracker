'use client';

import {
  Check,
  ChevronLeft,
  ChevronRight,
  Search,
  TrendingUp,
} from 'lucide-react';
import Image from 'next/image';
import { useMemo, useState } from 'react';
import type { Card as CardType, Product } from '@/external/dto/api-schemas';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Card } from '@/shared/components/ui/card';
import { Input } from '@/shared/components/ui/input';

const cardsPerPage = 18;

export function CardSearchPresenter({
  cards,
  products,
  isPending = false,
  onToggle,
}: {
  cards: CardType[];
  products: Product[];
  isPending?: boolean;
  onToggle?: (card: CardType) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [productCode, setProductCode] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const filteredCards = useMemo(() => {
    const normalizedName = name.trim().toLocaleLowerCase('ja');
    return cards.filter(
      (card) =>
        card.name.toLocaleLowerCase('ja').includes(normalizedName) &&
        (productCode === '' || card.product.code === productCode),
    );
  }, [cards, name, productCode]);
  const pageCount = Math.max(1, Math.ceil(filteredCards.length / cardsPerPage));
  const currentPage = Math.min(page, pageCount);
  const visibleCards = filteredCards.slice(
    (currentPage - 1) * cardsPerPage,
    currentPage * cardsPerPage,
  );

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
              setName(event.target.value);
              setPage(1);
            }}
            placeholder='カード名で検索'
            className='pl-9'
          />
        </label>
        <select
          value={productCode}
          onChange={(event) => {
            setProductCode(event.target.value);
            setPage(1);
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
      {filteredCards.length === 0 ? (
        <Card className='grid min-h-56 place-items-center p-8 text-center font-semibold'>
          条件に合うカードはありません
        </Card>
      ) : (
        <>
          <div className='grid gap-5 sm:grid-cols-2 xl:grid-cols-3'>
            {visibleCards.map((card, index) => (
              <Card key={card.id} className='overflow-hidden'>
                <div className='grid h-88 place-items-center border-b border-stone-200 bg-[var(--surface-ceramic)] p-4'>
                  <div className='relative aspect-[5/7] h-80 max-w-full overflow-hidden rounded-lg shadow-[0_1px_1px_rgba(0,0,0,0.18),0_6px_14px_rgba(0,0,0,0.10)]'>
                    <Image
                      src={card.imageUrl}
                      alt={`${card.name}のカード画像`}
                      fill
                      sizes='(min-width: 1536px) 240px, (min-width: 1280px) 28vw, (min-width: 640px) 45vw, 80vw'
                      priority={currentPage === 1 && index < 3}
                      unoptimized
                      className='object-contain'
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
                disabled={currentPage === 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                <ChevronLeft className='size-4' />
                前へ
              </Button>
              <p className='min-w-24 text-center text-sm font-semibold text-stone-700'>
                {currentPage} / {pageCount} ページ
              </p>
              <Button
                variant='outline'
                className='h-11 min-w-11 px-3'
                disabled={currentPage === pageCount}
                onClick={() =>
                  setPage((current) => Math.min(pageCount, current + 1))
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
