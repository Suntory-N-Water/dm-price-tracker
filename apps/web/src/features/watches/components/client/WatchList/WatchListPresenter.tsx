import { Link } from '@tanstack/react-router';
import { Ban, Eye, Pencil, Search, Trash2 } from 'lucide-react';
import { lazy, Suspense, useDeferredValue, useMemo, useState } from 'react';
import type {
  BulkExcludeResponse,
  CardWatch,
  Product,
} from '@/shared/api/types';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Card } from '@/shared/components/ui/card';
import { Input } from '@/shared/components/ui/input';

// ダイアログは操作するまで描画されないため、一覧の初期チャンクから切り離す
const WatchSettingsDialog = lazy(async () => ({
  default: (await import('./WatchSettingsDialog')).WatchSettingsDialog,
}));
const BulkExcludeDialog = lazy(async () => ({
  default: (await import('./BulkExcludeDialog')).BulkExcludeDialog,
}));

const pencilIcon = <Pencil className='size-3.5' />;
const trashIcon = <Trash2 className='size-3.5' />;
const eyeIcon = <Eye className='size-3.5' />;

type Props = {
  watches: CardWatch[];
  products: Product[];
  isPending?: boolean;
  onStop?: (cardId: string) => Promise<void>;
  onUpdate?: (
    cardId: string,
    input: {
      additionalKeywords: string[];
      cardExcludeKeywords: string[];
    },
  ) => Promise<void>;
  onBulkExclude?: (input: {
    cardIds: string[];
    excludeKeyword: string;
  }) => Promise<BulkExcludeResponse>;
};

export function WatchListPresenter({
  watches,
  products,
  isPending = false,
  onStop,
  onUpdate,
  onBulkExclude,
}: Props) {
  const [name, setName] = useState('');
  const [productCode, setProductCode] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editing, setEditing] = useState<CardWatch | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);

  // 一覧は全件描画するため、絞り込みより入力の反映を優先させる
  const deferredName = useDeferredValue(name);
  const filteredWatches = useMemo(() => {
    const normalizedName = deferredName.trim().toLocaleLowerCase('ja');
    return watches.filter(
      (watch) =>
        watch.card.name.toLocaleLowerCase('ja').includes(normalizedName) &&
        (productCode === '' || watch.card.product.code === productCode),
    );
  }, [deferredName, productCode, watches]);
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  return (
    <div className='space-y-6'>
      <h1 className='text-3xl font-bold tracking-tight'>価格チェック中</h1>

      <div className='flex flex-col gap-3 lg:flex-row'>
        <label
          className='relative block max-w-xl flex-1'
          htmlFor='watch-search'
        >
          <Search className='absolute left-3 top-3 size-4 text-stone-400' />
          <span className='sr-only'>カード名で検索</span>
          <Input
            id='watch-search'
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

      {selectedIds.length > 0 && (
        <Card className='flex flex-col items-start justify-between gap-3 border-emerald-200 bg-emerald-50 p-4 sm:flex-row sm:items-center'>
          <span className='text-sm font-semibold'>
            {selectedIds.length}枚を選択中
          </span>
          <Button
            size='sm'
            onPointerEnter={() => void import('./BulkExcludeDialog')}
            onFocus={() => void import('./BulkExcludeDialog')}
            onClick={() => setBulkOpen(true)}
          >
            <Ban className='size-4' />
            選択したカードに除外ワードを追加
          </Button>
        </Card>
      )}

      {filteredWatches.length === 0 ? (
        <Card className='grid min-h-56 place-items-center p-8 text-center'>
          <div>
            <p className='font-semibold'>
              {watches.length === 0
                ? '価格チェック中のカードはありません'
                : '条件に合うカードはありません'}
            </p>
            {watches.length === 0 && (
              <Button asChild className='mt-4'>
                <Link to='/cards'>カードを探す</Link>
              </Button>
            )}
          </div>
        </Card>
      ) : (
        <div className='space-y-3'>
          {filteredWatches.map((watch) => (
            <Card
              key={watch.card.id}
              className='grid gap-4 p-4 md:grid-cols-[auto_1fr_auto] md:items-center lg:grid-cols-[auto_1fr_150px_auto]'
            >
              <input
                type='checkbox'
                className='size-4 accent-emerald-700'
                aria-label={`${watch.card.name}を選択`}
                checked={selectedIdSet.has(watch.card.id)}
                onChange={(event) =>
                  setSelectedIds((current) =>
                    event.target.checked
                      ? [...current, watch.card.id]
                      : current.filter((id) => id !== watch.card.id),
                  )
                }
              />
              <div className='flex min-w-0 items-center gap-4'>
                <img
                  src={watch.card.imageUrl}
                  alt={`${watch.card.name}のカード画像`}
                  width={136}
                  height={192}
                  crossOrigin='use-credentials'
                  loading='lazy'
                  className='h-24 w-17 shrink-0 rounded-md bg-[var(--surface-ceramic)] object-contain p-1'
                />
                <div className='min-w-0'>
                  <h2 className='font-bold leading-snug'>{watch.card.name}</h2>
                  <p className='mt-1 text-sm text-stone-500'>
                    {watch.card.product.name}
                  </p>
                  {watch.additionalKeywords.length > 0 && (
                    <div className='mt-2 flex flex-wrap gap-1'>
                      {watch.additionalKeywords.map((keyword) => (
                        <Badge key={keyword}>{keyword}</Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <p className='text-xs text-stone-500'>現在価格</p>
                <p className='text-xl font-black text-emerald-800'>
                  {watch.currentPrice === null
                    ? '取得待ち'
                    : `¥${watch.currentPrice.toLocaleString('ja-JP')}`}
                </p>
              </div>
              <div className='flex flex-wrap gap-2 md:col-start-2 lg:col-start-auto'>
                <Button
                  variant='outline'
                  size='sm'
                  onPointerEnter={() => void import('./WatchSettingsDialog')}
                  onFocus={() => void import('./WatchSettingsDialog')}
                  onClick={() => setEditing(watch)}
                >
                  {pencilIcon}
                  編集
                </Button>
                <Button
                  variant='outline'
                  size='sm'
                  disabled={isPending}
                  onClick={async () => {
                    if (onStop === undefined) {
                      return;
                    }
                    await onStop(watch.card.id);
                    setSelectedIds((current) =>
                      current.filter((id) => id !== watch.card.id),
                    );
                  }}
                >
                  {trashIcon}
                  解除
                </Button>
                <Button asChild size='sm'>
                  <Link
                    to='/watches/$cardId'
                    params={{ cardId: watch.card.id }}
                  >
                    {eyeIcon}
                    価格を見る
                  </Link>
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {editing !== null && (
        <Suspense fallback={null}>
          <WatchSettingsDialog
            watch={editing}
            isPending={isPending}
            onClose={() => setEditing(null)}
            onSave={async (input) => {
              await onUpdate?.(editing.card.id, input);
            }}
          />
        </Suspense>
      )}

      {bulkOpen && (
        <Suspense fallback={null}>
          <BulkExcludeDialog
            watches={watches}
            selectedIds={selectedIds}
            isPending={isPending}
            onClose={() => setBulkOpen(false)}
            onSubmit={onBulkExclude}
            onExcluded={() => setSelectedIds([])}
          />
        </Suspense>
      )}
    </div>
  );
}
