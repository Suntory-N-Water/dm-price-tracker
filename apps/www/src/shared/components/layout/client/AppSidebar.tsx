'use client';

import { Ban, Box, Search, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/shared/lib/utils';

const userItems = [
  { href: '/watches', label: '価格チェック中', icon: TrendingUp },
  { href: '/cards', label: 'カードを探す', icon: Search },
  {
    href: '/settings/common-exclude-keywords',
    label: '共通除外ワード',
    icon: Ban,
  },
];

const adminItems = [{ href: '/admin/products', label: '商品', icon: Box }];

export function AppSidebar({ userType }: { userType: 'user' | 'admin' }) {
  const pathname = usePathname();
  const items = userType === 'admin' ? adminItems : userItems;

  return (
    <aside className='border-b border-stone-200 bg-white md:min-h-[calc(100vh-65px)] md:w-64 md:border-b-0 md:border-r'>
      <nav
        className='flex gap-1 overflow-x-auto p-3 md:flex-col md:p-5'
        aria-label={userType === 'admin' ? '管理者メニュー' : '利用者メニュー'}
      >
        {items.map(({ href, label, icon: Icon }) => {
          const active =
            pathname === href ||
            (href === '/watches' && pathname.startsWith('/watches/'));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-950',
                active && 'bg-emerald-50 text-emerald-800',
              )}
            >
              <Icon className='size-4' aria-hidden='true' />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
