'use client';

import { CheckCircle2, Plus, RefreshCw, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { AdminProduct, Product } from '@/external/dto/api-schemas';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Card } from '@/shared/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/components/ui/dialog';
import { Input } from '@/shared/components/ui/input';
import { formatJstDateTime } from '@/shared/lib/date-time';
import { cn } from '@/shared/lib/utils';

export function AdminProductListPresenter({
  products,
  availableProducts = [],
  isPending = false,
  onSync,
  onCrawl,
}: {
  products: AdminProduct[];
  availableProducts?: Product[];
  isPending?: boolean;
  onSync?: () => Promise<{ syncedCount: number }>;
  onCrawl?: (productCode: string) => Promise<void>;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [searchName, setSearchName] = useState('');
  const [selectedCode, setSelectedCode] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const filteredAvailable = useMemo(() => {
    const query = searchName.trim().toLocaleLowerCase('ja');
    return availableProducts.filter((product) =>
      product.name.toLocaleLowerCase('ja').includes(query),
    );
  }, [availableProducts, searchName]);

  return (
    <div className='space-y-6'>
      <div className='flex flex-col justify-between gap-4 sm:flex-row sm:items-end'>
        <div>
          <h1 className='text-3xl font-bold tracking-tight'>商品</h1>
        </div>
        <div className='flex flex-wrap gap-2'>
          <Button
            variant='outline'
            disabled={isPending}
            onClick={async () => {
              setError('');
              try {
                const result = await onSync?.();
                if (result !== undefined) {
                  setMessage(
                    `商品一覧を更新しました（${result.syncedCount}件）`,
                  );
                }
              } catch (caught) {
                setError(
                  caught instanceof Error
                    ? caught.message
                    : '商品一覧を更新できませんでした',
                );
              }
            }}
          >
            <RefreshCw className='size-4' />
            商品一覧を更新
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className='size-4' />
                商品を追加
              </Button>
            </DialogTrigger>
            <DialogContent className='flex h-[88vh] max-h-[680px] flex-col overflow-hidden'>
              <DialogHeader>
                <DialogTitle className='text-xl font-bold'>
                  商品を追加
                </DialogTitle>
                <DialogDescription className='text-sm text-stone-600'>
                  同期済みの商品から、カード情報を取得する対象を選びます。
                </DialogDescription>
              </DialogHeader>
              <label className='relative block' htmlFor='product-search'>
                <Search className='absolute left-3 top-3 size-4 text-stone-400' />
                <span className='sr-only'>商品名で検索</span>
                <Input
                  id='product-search'
                  type='search'
                  value={searchName}
                  onChange={(event) => setSearchName(event.target.value)}
                  placeholder='商品名で検索'
                  className='pl-9'
                />
              </label>
              <div className='mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto'>
                {filteredAvailable.length > 0 && (
                  <p className='px-1 pb-1 text-xs text-stone-500'>
                    公式サイトの掲載順（新しい順）
                  </p>
                )}
                {filteredAvailable.length === 0 ? (
                  <p className='p-6 text-center text-sm text-stone-500'>
                    追加できる商品はありません
                  </p>
                ) : (
                  filteredAvailable.map((product) => (
                    <button
                      key={product.code}
                      type='button'
                      aria-pressed={selectedCode === product.code}
                      onClick={() => setSelectedCode(product.code)}
                      className={cn(
                        'relative min-h-16 w-full cursor-pointer rounded-xl border border-stone-200 bg-white px-4 py-3 pr-12 text-left transition-colors hover:border-emerald-400 hover:bg-emerald-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 sm:pr-28',
                        selectedCode === product.code &&
                          'border-emerald-500 bg-emerald-50 shadow-sm',
                      )}
                    >
                      <p className='font-semibold'>{product.name}</p>
                      <p className='mt-1 font-mono text-xs text-stone-500'>
                        {product.code}
                      </p>
                      {selectedCode === product.code && (
                        <span className='absolute right-3 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-full bg-emerald-700 text-xs font-semibold text-white sm:h-auto sm:w-auto sm:gap-1 sm:px-2.5 sm:py-1'>
                          <CheckCircle2 className='size-3.5' />
                          <span className='sr-only sm:not-sr-only'>選択中</span>
                        </span>
                      )}
                    </button>
                  ))
                )}
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant='outline'>キャンセル</Button>
                </DialogClose>
                <Button
                  disabled={selectedCode === '' || isPending}
                  onClick={async () => {
                    await onCrawl?.(selectedCode);
                    setDialogOpen(false);
                    setSelectedCode('');
                    setMessage('カード情報の取得を開始しました');
                  }}
                >
                  選択した商品の取得を開始
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {message !== '' && (
        <p
          className='rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800'
          role='status'
        >
          {message}
        </p>
      )}
      {error !== '' && (
        <p
          className='rounded-lg bg-red-50 p-3 text-sm text-red-800'
          role='alert'
        >
          {error}
        </p>
      )}

      <Card className='overflow-x-auto'>
        <table className='w-full min-w-[720px] text-left text-sm'>
          <thead className='border-b border-stone-200 bg-stone-50 text-xs uppercase tracking-wide text-stone-500'>
            <tr>
              <th className='px-5 py-3 font-semibold'>商品</th>
              <th className='px-5 py-3 font-semibold'>カード情報の取得</th>
              <th className='px-5 py-3 font-semibold'>更新日時</th>
              <th className='px-5 py-3'>
                <span className='sr-only'>操作</span>
              </th>
            </tr>
          </thead>
          <tbody className='divide-y divide-stone-200'>
            {products.map((product) => {
              const label =
                product.status === 'FINISHED'
                  ? '完了'
                  : product.status === 'ABORTED'
                    ? '失敗'
                    : '取得中';
              return (
                <tr key={product.code}>
                  <td className='px-5 py-4'>
                    <p className='font-semibold'>{product.name}</p>
                    <p className='mt-1 font-mono text-xs text-stone-500'>
                      {product.code}
                    </p>
                  </td>
                  <td className='px-5 py-4'>
                    <Badge
                      className={cn(
                        label === '完了' &&
                          'border-emerald-200 bg-emerald-50 text-emerald-800',
                        label === '取得中' &&
                          'border-amber-200 bg-amber-50 text-amber-800',
                        label === '失敗' &&
                          'border-red-200 bg-red-50 text-red-800',
                      )}
                      title={product.error ?? undefined}
                    >
                      {label}
                    </Badge>
                  </td>
                  <td className='px-5 py-4 text-stone-600'>
                    <time dateTime={`${product.updatedAt.replace(' ', 'T')}Z`}>
                      {formatJstDateTime(product.updatedAt)}
                    </time>
                  </td>
                  <td className='px-5 py-4 text-right'>
                    {product.status === 'ABORTED' && (
                      <Button
                        size='sm'
                        variant='outline'
                        disabled={isPending}
                        onClick={() => onCrawl?.(product.code)}
                      >
                        <RefreshCw className='size-3.5' />
                        再取得
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {products.length === 0 && (
          <p className='p-10 text-center text-sm text-stone-500'>
            取得を開始した商品はありません
          </p>
        )}
      </Card>
    </div>
  );
}
