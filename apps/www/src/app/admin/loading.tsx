export default function AdminLoading() {
  return (
    <div className='space-y-5'>
      <span className='sr-only'>読み込み中</span>
      <div className='h-9 w-40 animate-pulse rounded-lg bg-stone-200' />
      <div className='h-96 animate-pulse rounded-xl bg-stone-200' />
    </div>
  );
}
