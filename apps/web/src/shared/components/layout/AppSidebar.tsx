import { Link } from '@tanstack/react-router';
import { Ban, Box, Search, TrendingUp } from 'lucide-react';

const userItems = [
  { to: '/watches', label: '価格チェック中', icon: TrendingUp },
  { to: '/cards', label: 'カードを探す', icon: Search },
  {
    to: '/settings/common-exclude-keywords',
    label: '共通除外ワード',
    icon: Ban,
  },
] as const;

const adminItems = [
  { to: '/admin/products', label: '商品', icon: Box },
] as const;

export function AppSidebar({ userType }: { userType: 'user' | 'admin' }) {
  const items = userType === 'admin' ? adminItems : userItems;

  return (
    <aside className='border-b border-stone-200 bg-white md:min-h-[calc(100vh-65px)] md:w-64 md:border-b-0 md:border-r'>
      <nav
        className='flex gap-1 overflow-x-auto p-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:flex-col md:p-5'
        aria-label={userType === 'admin' ? '管理者メニュー' : '利用者メニュー'}
      >
        {items.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            activeOptions={{ exact: to !== '/watches' }}
            className='flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-950'
            activeProps={{
              className:
                'flex shrink-0 items-center gap-3 rounded-lg bg-emerald-50 px-3 py-2.5 text-sm font-medium text-emerald-800',
            }}
          >
            <Icon className='size-4' aria-hidden='true' />
            {label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
