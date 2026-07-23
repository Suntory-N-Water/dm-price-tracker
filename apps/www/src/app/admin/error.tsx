'use client';

import { ShieldAlert } from 'lucide-react';
import { useEffect } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Card } from '@/shared/components/ui/card';

export default function AdminError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error('管理者画面の表示に失敗しました', error);
  }, [error]);

  return (
    <Card className='grid min-h-80 place-items-center p-8 text-center'>
      <div>
        <ShieldAlert className='mx-auto mb-4 size-10 text-red-700' />
        <h1 className='text-xl font-bold'>管理画面を表示できませんでした</h1>
        <p className='mt-2 text-sm text-stone-600'>{error.message}</p>
        <Button className='mt-5' onClick={unstable_retry}>
          再読み込み
        </Button>
      </div>
    </Card>
  );
}
