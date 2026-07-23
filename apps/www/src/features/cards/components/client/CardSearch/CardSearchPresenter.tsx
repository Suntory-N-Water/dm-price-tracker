'use client';

import { Check, Search, TrendingUp } from 'lucide-react';
import Image from 'next/image';
import { useMemo, useState } from 'react';
import type { Card as CardType, Product } from '@/external/dto/api-schemas';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Card } from '@/shared/components/ui/card';
import { Input } from '@/shared/components/ui/input';

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
  const [error, setError] = useState('');
  const filteredCards = useMemo(() => {
    const normalizedName = name.trim().toLocaleLowerCase('ja');
    return cards.filter(
      (card) =>
        card.name.toLocaleLowerCase('ja').includes(normalizedName) &&
        (productCode === '' || card.product.code === productCode),
    );
  }, [cards, name, productCode]);

  return (
    <div className='space-y-6'>
      <div>
        <p className='mb-1 text-sm font-semibold text-emerald-700'>
          CARD CATALOG
        </p>
        <h1 className='text-3xl font-bold tracking-tight'>カードを探す</h1>
      </div>
      <div className='flex flex-col gap-3 lg:flex-row'>
        <label className='relative block max-w-xl flex-1' htmlFor='card-search'>
          <Search className='absolute left-3 top-3 size-4 text-stone-400' />
          <span className='sr-only'>カード名で検索</span>
          <Input
            id='card-search'
            type='search'
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder='カード名で検索'
            className='pl-9'
          />
        </label>
        <select
          value={productCode}
          onChange={(event) => setProductCode(event.target.value)}
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
        <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'>
          {filteredCards.map((card) => (
            <Card key={card.id} className='overflow-hidden'>
              <div className='grid h-64 place-items-center bg-stone-100 p-5'>
                <Image
                  src={card.imageUrl}
                  alt={`${card.name}のカード画像`}
                  width={240}
                  height={336}
                  unoptimized
                  className='h-full max-w-full rounded-lg object-contain shadow-lg'
                />
              </div>
              <div className='space-y-3 p-4'>
                <Badge>{card.product.code.toUpperCase()}</Badge>
                <div>
                  <h2 className='min-h-12 font-bold leading-snug'>
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
      )}
    </div>
  );
}
