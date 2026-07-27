import { CheckCircle2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { BulkExcludeResponse, CardWatch } from '@/shared/api/types';
import { Button } from '@/shared/components/ui/button';
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

export function BulkExcludeDialog({
  watches,
  selectedIds,
  isPending,
  onClose,
  onSubmit,
  onExcluded,
}: {
  watches: CardWatch[];
  selectedIds: string[];
  isPending: boolean;
  onClose: () => void;
  onSubmit?: (input: {
    cardIds: string[];
    excludeKeyword: string;
  }) => Promise<BulkExcludeResponse>;
  onExcluded: () => void;
}) {
  const [keyword, setKeyword] = useState('');
  const [result, setResult] = useState<BulkExcludeResponse | null>(null);
  const [error, setError] = useState('');
  // 結果一覧の件数ぶん watches を線形探索しないよう、カード名を引ける形にしておく
  const cardNameById = useMemo(
    () => new Map(watches.map((watch) => [watch.card.id, watch.card.name])),
    [watches],
  );

  return (
    <Dialog open onOpenChange={onClose}>
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
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder='例: サイン入り'
            maxLength={50}
          />
        </label>
        {result !== null && (
          <div
            className='mt-4 space-y-4 rounded-lg bg-stone-100 p-4 text-sm'
            role='status'
          >
            <div>
              <p className='flex items-center gap-2 font-semibold text-emerald-800'>
                <CheckCircle2 className='size-4' />
                追加できたカード: {result.updated.length}枚
              </p>
              <ul className='mt-2 space-y-1 pl-6 text-stone-700'>
                {result.updated.map(({ cardId }) => (
                  <li key={cardId}>{cardNameById.get(cardId) ?? cardId}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className='font-semibold text-stone-700'>
                スキップしたカード: {result.skipped.length}枚
              </p>
              <ul className='mt-2 space-y-2 pl-6 text-stone-600'>
                {result.skipped.map(({ cardId, reason }) => (
                  <li key={cardId}>
                    <span className='font-medium text-stone-800'>
                      {cardNameById.get(cardId) ?? cardId}
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
          {result === null && (
            <Button
              disabled={keyword.trim() === '' || isPending}
              onClick={async () => {
                setError('');
                try {
                  const response = await onSubmit?.({
                    cardIds: selectedIds,
                    excludeKeyword: keyword,
                  });
                  if (response !== undefined) {
                    setResult(response);
                    onExcluded();
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
  );
}
