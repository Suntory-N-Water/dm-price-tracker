import { useState } from 'react';
import type { CardWatch } from '@/shared/api/types';
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

export function WatchSettingsDialog({
  watch,
  isPending,
  onClose,
  onSave,
}: {
  watch: CardWatch;
  isPending: boolean;
  onClose: () => void;
  onSave: (input: {
    additionalKeywords: string[];
    cardExcludeKeywords: string[];
  }) => Promise<void>;
}) {
  const [error, setError] = useState('');
  const [additionalKeywords, setAdditionalKeywords] = useState(() => [
    ...watch.additionalKeywords,
    ...Array.from({ length: 3 - watch.additionalKeywords.length }, () => ''),
  ]);
  const [cardExcludeKeywords, setCardExcludeKeywords] = useState(() => {
    const slotCount = Math.max(0, 3 - watch.commonExcludeKeywords.length);
    return [
      ...watch.cardExcludeKeywords.slice(0, slotCount),
      ...Array.from(
        {
          length: Math.max(0, slotCount - watch.cardExcludeKeywords.length),
        },
        () => '',
      ),
    ];
  });

  return (
    <Dialog open onOpenChange={onClose}>
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
            onClick={async () => {
              setError('');
              try {
                await onSave({ additionalKeywords, cardExcludeKeywords });
                onClose();
              } catch (caught) {
                setError(
                  caught instanceof Error
                    ? caught.message
                    : '設定を変更できませんでした',
                );
              }
            }}
          >
            変更する
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
