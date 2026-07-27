import { useQueryErrorResetBoundary } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { AlertTriangle, LoaderCircle } from 'lucide-react';
import { SessionExpiredError } from '@/shared/api/client';
import { Button } from '@/shared/components/ui/button';
import { Card } from '@/shared/components/ui/card';

export function RoutePending() {
  return (
    <div className='grid min-h-64 place-items-center' role='status'>
      <div className='text-center text-stone-600'>
        <LoaderCircle className='mx-auto mb-3 size-8 animate-spin motion-reduce:animate-none' />
        読み込み中です
      </div>
    </div>
  );
}

export function RouteError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  const router = useRouter();
  const queryErrorResetBoundary = useQueryErrorResetBoundary();
  const sessionExpired = error instanceof SessionExpiredError;

  return (
    <Card className='mx-auto max-w-xl p-8 text-center'>
      <AlertTriangle className='mx-auto mb-4 size-10 text-red-700' />
      <h1 className='text-xl font-bold'>画面を表示できませんでした</h1>
      <p className='mt-3 text-sm text-stone-600'>{error.message}</p>
      <Button
        className='mt-6'
        onClick={() => {
          if (sessionExpired) {
            window.location.reload();
            return;
          }
          queryErrorResetBoundary.reset();
          reset();
          void router.invalidate();
        }}
      >
        {sessionExpired ? '再読み込み' : '再試行'}
      </Button>
    </Card>
  );
}

export function RouteNotFound() {
  return (
    <Card className='mx-auto mt-12 max-w-xl p-8 text-center'>
      <h1 className='text-2xl font-bold'>ページが見つかりません</h1>
      <p className='mt-3 text-sm text-stone-600'>
        URLを確認して、もう一度お試しください。
      </p>
    </Card>
  );
}
