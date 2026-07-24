'use client';

import { Ban, CheckCircle2, Eye, Pencil, Search, Trash2 } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { useMemo, useState } from 'react';
import type { CardWatch, Product } from '@/external/dto/api-schemas';
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
} from '@/shared/components/ui/dialog';
import { Input } from '@/shared/components/ui/input';

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
  }) => Promise<{
    updated: { cardId: string }[];
    skipped: { cardId: string; reason: string }[];
  }>;
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
  const [bulkWord, setBulkWord] = useState('');
  const [bulkResult, setBulkResult] = useState<{
    updated: { cardId: string }[];
    skipped: { cardId: string; reason: string }[];
  } | null>(null);
  const [error, setError] = useState('');

  const filteredWatches = useMemo(() => {
    const normalizedName = name.trim().toLocaleLowerCase('ja');
    return watches.filter(
      (watch) =>
        watch.card.name.toLocaleLowerCase('ja').includes(normalizedName) &&
        (productCode === '' || watch.card.product.code === productCode),
    );
  }, [name, productCode, watches]);

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
            onClick={() => {
              setBulkWord('');
              setBulkResult(null);
              setBulkOpen(true);
            }}
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
                <Link href='/cards'>カードを探す</Link>
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
                checked={selectedIds.includes(watch.card.id)}
                onChange={(event) =>
                  setSelectedIds((current) =>
                    event.target.checked
                      ? [...current, watch.card.id]
                      : current.filter((id) => id !== watch.card.id),
                  )
                }
              />
              <div className='flex min-w-0 items-center gap-4'>
                <Image
                  src={watch.card.imageUrl}
                  alt={`${watch.card.name}のカード画像`}
                  width={136}
                  height={192}
                  unoptimized
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
                  onClick={() => setEditing(watch)}
                >
                  <Pencil className='size-3.5' />
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
                  <Trash2 className='size-3.5' />
                  解除
                </Button>
                <Button asChild size='sm'>
                  <Link href={`/watches/${encodeURIComponent(watch.card.id)}`}>
                    <Eye className='size-3.5' />
                    価格を見る
                  </Link>
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={() => setEditing(null)}>
        {editing !== null && (
          <WatchSettingsDialog
            watch={editing}
            isPending={isPending}
            onSave={async (input) => {
              setError('');
              try {
                await onUpdate?.(editing.card.id, input);
                setEditing(null);
              } catch (caught) {
                setError(
                  caught instanceof Error
                    ? caught.message
                    : '設定を変更できませんでした',
                );
              }
            }}
            error={error}
          />
        )}
      </Dialog>

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className='text-xl font-bold'>
              選択したカードに除外ワードを追加
            </DialogTitle>
            <DialogDescription className='text-sm text-stone-600'>
              空き枠がないカードは変更せず、結果を一覧でお知らせします。
            </DialogDescription>
          </DialogHeader>
          <label
            className='space-y-2 text-sm font-semibold'
            htmlFor='bulk-exclude-keyword'
          >
            追加する除外ワード
            <Input
              id='bulk-exclude-keyword'
              value={bulkWord}
              onChange={(event) => setBulkWord(event.target.value)}
              placeholder='例: サイン入り'
              maxLength={50}
            />
          </label>
          {bulkResult !== null && (
            <div
              className='mt-4 space-y-4 rounded-lg bg-stone-100 p-4 text-sm'
              role='status'
            >
              <div>
                <p className='flex items-center gap-2 font-semibold text-emerald-800'>
                  <CheckCircle2 className='size-4' />
                  追加できたカード: {bulkResult.updated.length}枚
                </p>
                <ul className='mt-2 space-y-1 pl-6 text-stone-700'>
                  {bulkResult.updated.map(({ cardId }) => (
                    <li key={cardId}>
                      {watches.find((watch) => watch.card.id === cardId)?.card
                        .name ?? cardId}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className='font-semibold text-stone-700'>
                  スキップしたカード: {bulkResult.skipped.length}枚
                </p>
                <ul className='mt-2 space-y-2 pl-6 text-stone-600'>
                  {bulkResult.skipped.map(({ cardId, reason }) => (
                    <li key={cardId}>
                      <span className='font-medium text-stone-800'>
                        {watches.find((watch) => watch.card.id === cardId)?.card
                          .name ?? cardId}
                      </span>
                      <span className='ml-2'>{reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          {error !== '' && (
            <p className='mt-3 text-sm text-red-700' role='alert'>
              {error}
            </p>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant='outline'>閉じる</Button>
            </DialogClose>
            {bulkResult === null && (
              <Button
                disabled={bulkWord.trim() === '' || isPending}
                onClick={async () => {
                  setError('');
                  try {
                    const result = await onBulkExclude?.({
                      cardIds: selectedIds,
                      excludeKeyword: bulkWord,
                    });
                    if (result !== undefined) {
                      setBulkResult(result);
                      setSelectedIds([]);
                    }
                  } catch (caught) {
                    setError(
                      caught instanceof Error
                        ? caught.message
                        : '除外ワードを追加できませんでした',
                    );
                  }
                }}
              >
                {selectedIds.length}枚に追加する
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function WatchSettingsDialog({
  watch,
  isPending,
  onSave,
  error,
}: {
  watch: CardWatch;
  isPending: boolean;
  onSave: (input: {
    additionalKeywords: string[];
    cardExcludeKeywords: string[];
  }) => Promise<void>;
  error: string;
}) {
  const [additionalKeywords, setAdditionalKeywords] = useState([
    ...watch.additionalKeywords,
    ...Array.from({ length: 3 - watch.additionalKeywords.length }, () => ''),
  ]);
  const cardSlotCount = Math.max(0, 3 - watch.commonExcludeKeywords.length);
  const [cardExcludeKeywords, setCardExcludeKeywords] = useState([
    ...watch.cardExcludeKeywords.slice(0, cardSlotCount),
    ...Array.from(
      {
        length: Math.max(0, cardSlotCount - watch.cardExcludeKeywords.length),
      },
      () => '',
    ),
  ]);

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle className='pr-8 text-xl font-bold'>
          {watch.card.name} の設定
        </DialogTitle>
        <DialogDescription className='text-sm text-stone-600'>
          公式カード名は必ず検索に使用され、変更できません。
        </DialogDescription>
      </DialogHeader>
      <div className='space-y-5'>
        <label
          className='block space-y-2 text-sm font-semibold'
          htmlFor='official-card-name'
        >
          公式カード名
          <Input id='official-card-name' value={watch.card.name} disabled />
        </label>
        <fieldset>
          <legend className='font-semibold'>メルカリ検索の追加ワード</legend>
          <p className='mb-3 text-sm text-stone-500'>
            最大3単語。1枠に1単語を入力します。
          </p>
          <div className='grid gap-2 sm:grid-cols-3'>
            {additionalKeywords.map((keyword, index) => (
              <Input
                key={`additional-${index.toString()}`}
                aria-label={`追加ワード${index + 1}`}
                value={keyword}
                onChange={(event) =>
                  setAdditionalKeywords((current) =>
                    current.map((value, currentIndex) =>
                      currentIndex === index ? event.target.value : value,
                    ),
                  )
                }
                placeholder='未設定'
                maxLength={50}
              />
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className='font-semibold'>除外ワード（3枠）</legend>
          <p className='mb-3 text-sm text-stone-500'>
            共通除外ワードが {watch.commonExcludeKeywords.length}
            枠を使用しています。
          </p>
          <div className='grid gap-2 sm:grid-cols-3'>
            {watch.commonExcludeKeywords.map((keyword, index) => (
              <Input
                key={keyword}
                aria-label={`共通除外ワード${index + 1}`}
                value={keyword}
                disabled
              />
            ))}
            {cardExcludeKeywords.map((keyword, index) => (
              <Input
                key={`exclude-${index.toString()}`}
                aria-label={`カード別除外ワード${index + 1}`}
                value={keyword}
                onChange={(event) =>
                  setCardExcludeKeywords((current) =>
                    current.map((value, currentIndex) =>
                      currentIndex === index ? event.target.value : value,
                    ),
                  )
                }
                placeholder='カード別'
                maxLength={50}
              />
            ))}
          </div>
        </fieldset>
      </div>
      {error !== '' && (
        <p className='mt-4 text-sm text-red-700' role='alert'>
          {error}
        </p>
      )}
      <DialogFooter>
        <DialogClose asChild>
          <Button variant='outline'>キャンセル</Button>
        </DialogClose>
        <Button
          disabled={isPending}
          onClick={() => onSave({ additionalKeywords, cardExcludeKeywords })}
        >
          変更する
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
