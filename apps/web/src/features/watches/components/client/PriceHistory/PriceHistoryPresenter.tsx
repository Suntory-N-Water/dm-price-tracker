import { Link } from '@tanstack/react-router';
import { ArrowLeft, ImageOff, ShoppingBag } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { PriceHistoryPeriod } from '@/features/watches/api';
import type { PriceHistory } from '@/shared/api/types';
import { Button } from '@/shared/components/ui/button';
import { Card } from '@/shared/components/ui/card';
import { formatJstDateTime } from '@/shared/lib/date-time';
import { cn } from '@/shared/lib/utils';

export function PriceHistoryPresenter({
  history,
  period,
  onPeriodChange,
}: {
  history: PriceHistory;
  period: PriceHistoryPeriod;
  onPeriodChange: (period: PriceHistoryPeriod) => void;
}) {
  const [selectedAt, setSelectedAt] = useState(
    history.pricePoints.at(-1)?.crawledAt ?? '',
  );
  const selected =
    history.pricePoints.find((point) => point.crawledAt === selectedAt) ??
    history.pricePoints.at(-1);
  // Math.min(...prices) は価格点が増えるとスプレッドの引数上限に達するため使わない
  const { minPrice, maxPrice } = useMemo(() => {
    const first = history.pricePoints[0];
    if (first === undefined) {
      return { minPrice: 0, maxPrice: 0 };
    }
    let min = first.price;
    let max = first.price;
    for (const point of history.pricePoints) {
      if (point.price < min) {
        min = point.price;
      }
      if (point.price > max) {
        max = point.price;
      }
    }
    return { minPrice: min, maxPrice: max };
  }, [history.pricePoints]);
  const priceRange = Math.max(1, maxPrice - minPrice);

  return (
    <div className='space-y-6'>
      <Button asChild variant='ghost' className='-ml-3'>
        <Link to='/watches'>
          <ArrowLeft className='size-4' />
          価格チェック中へ戻る
        </Link>
      </Button>

      <Card className='grid gap-5 p-5 sm:grid-cols-[100px_1fr] sm:items-center lg:grid-cols-[110px_1fr_auto] lg:p-7'>
        <img
          src={history.card.imageUrl}
          alt={`${history.card.name}のカード画像`}
          width={200}
          height={280}
          crossOrigin='use-credentials'
          className='h-36 w-25 rounded-lg bg-[var(--surface-ceramic)] object-contain p-1'
        />
        <div>
          <p className='mb-2 text-sm font-semibold text-emerald-700'>
            {history.card.product.name}
          </p>
          <h1 className='text-2xl font-black tracking-tight lg:text-3xl'>
            {history.card.name}
          </h1>
        </div>
        <div className='sm:col-start-2 lg:col-start-auto lg:text-right'>
          <p className='text-sm text-stone-500'>現在価格</p>
          <p className='text-3xl font-black text-emerald-800'>
            {history.currentPrice === null
              ? '取得待ち'
              : `¥${history.currentPrice.toLocaleString('ja-JP')}`}
          </p>
        </div>
      </Card>

      <div className='grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,.65fr)]'>
        <Card className='p-5 lg:p-6'>
          <div className='mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-center'>
            <h2 className='text-xl font-bold'>価格推移</h2>
            <div className='flex rounded-lg bg-stone-100 p-1'>
              {(
                [
                  ['24h', '24時間'],
                  ['7d', '7日'],
                  ['30d', '30日'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type='button'
                  onClick={() => onPeriodChange(value)}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-semibold text-stone-600',
                    period === value && 'bg-white text-emerald-800 shadow-sm',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {history.pricePoints.length === 0 ? (
            <div className='grid h-72 place-items-center text-sm text-stone-500'>
              価格データはまだありません
            </div>
          ) : (
            <div className='relative h-80 overflow-hidden rounded-lg border border-stone-200 bg-[linear-gradient(to_bottom,#e7e5e4_1px,transparent_1px)] bg-[size:100%_25%] px-7 py-8'>
              <div className='absolute inset-x-8 bottom-8 top-8 border-b border-l border-stone-300' />
              {history.pricePoints.map((point, index) => {
                const left =
                  history.pricePoints.length === 1
                    ? 50
                    : 5 + (index / (history.pricePoints.length - 1)) * 90;
                const top = 85 - ((point.price - minPrice) / priceRange) * 70;
                return (
                  <button
                    key={point.crawledAt}
                    type='button'
                    aria-label={`${formatJstDateTime(point.crawledAt)}、${point.price.toLocaleString('ja-JP')}円`}
                    onClick={() => setSelectedAt(point.crawledAt)}
                    className={cn(
                      'absolute z-10 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-emerald-700 shadow ring-2 ring-emerald-700/20 transition-transform hover:scale-125',
                      selected?.crawledAt === point.crawledAt &&
                        'size-5 bg-amber-500 ring-amber-500/25',
                    )}
                    style={{ left: `${left}%`, top: `${top}%` }}
                  />
                );
              })}
              <span className='absolute bottom-2 left-8 text-xs text-stone-500'>
                {
                  formatJstDateTime(
                    history.pricePoints[0]?.crawledAt ?? '',
                  ).split(' ')[0]
                }
              </span>
              <span className='absolute bottom-2 right-8 text-xs text-stone-500'>
                {
                  formatJstDateTime(
                    history.pricePoints.at(-1)?.crawledAt ?? '',
                  ).split(' ')[0]
                }
              </span>
              <span className='absolute left-2 top-5 text-xs text-stone-500'>
                ¥{maxPrice.toLocaleString('ja-JP')}
              </span>
              <span className='absolute bottom-8 left-2 text-xs text-stone-500'>
                ¥{minPrice.toLocaleString('ja-JP')}
              </span>
            </div>
          )}
        </Card>

        <Card className='overflow-hidden'>
          <div className='flex items-start justify-between border-b border-stone-200 p-5'>
            <div>
              <h2 className='flex items-center gap-2 font-bold'>
                <ShoppingBag className='size-4 text-red-600' />
                メルカリ検索結果
              </h2>
              {selected !== undefined && (
                <time className='mt-1 block text-sm text-stone-500'>
                  {formatJstDateTime(selected.crawledAt)}
                </time>
              )}
            </div>
            {selected !== undefined && (
              <strong className='text-xl text-emerald-800'>
                ¥{selected.price.toLocaleString('ja-JP')}
              </strong>
            )}
          </div>
          <div className='grid min-h-96 place-items-center bg-stone-100 p-4'>
            {selected?.screenshotUrl === null ||
            selected?.screenshotUrl === undefined ? (
              <div className='max-w-xs text-center text-stone-600'>
                <ImageOff className='mx-auto mb-3 size-10 text-stone-400' />
                <p className='font-semibold'>
                  この時点の検索結果画像は残っていません
                </p>
              </div>
            ) : (
              <img
                src={selected.screenshotUrl}
                alt={`${formatJstDateTime(selected.crawledAt)}のメルカリ検索結果`}
                width={1200}
                height={800}
                crossOrigin='use-credentials'
                loading='lazy'
                className='max-h-[520px] w-full rounded-md object-contain shadow-sm'
              />
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
