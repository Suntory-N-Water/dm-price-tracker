import { ChartSpline } from 'lucide-react';
import { AppSidebar } from './AppSidebar';

export function AppLayout({
  children,
  userType,
}: {
  children: React.ReactNode;
  userType: 'user' | 'admin';
}) {
  return (
    <div className='min-h-screen bg-stone-50 text-stone-950'>
      <header className='sticky top-0 z-40 flex h-16 items-center border-b border-stone-200 bg-white/95 px-5 backdrop-blur md:px-8'>
        <div className='flex items-center gap-3'>
          <span className='grid size-9 place-items-center rounded-lg bg-emerald-700 text-white shadow-sm'>
            <ChartSpline className='size-5' aria-hidden='true' />
          </span>
          <span className='font-bold tracking-[0.08em]'>DM Price Tracker</span>
        </div>
        <span className='ml-auto rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-600'>
          {userType === 'admin' ? '管理者' : '利用者'}
        </span>
      </header>
      <div className='md:flex'>
        <AppSidebar userType={userType} />
        <main className='min-w-0 flex-1 p-5 md:p-8 lg:p-10'>{children}</main>
      </div>
    </div>
  );
}
