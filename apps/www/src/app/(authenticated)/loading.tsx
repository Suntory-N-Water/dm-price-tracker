export default function AuthenticatedLoading() {
  return (
    <div className='space-y-5'>
      <span className='sr-only'>読み込み中</span>
      <div className='h-9 w-64 animate-pulse rounded-lg bg-stone-200' />
      <div className='h-12 max-w-2xl animate-pulse rounded-lg bg-stone-200' />
      <div className='h-80 animate-pulse rounded-xl bg-stone-200' />
    </div>
  );
}
