import type { Metadata } from 'next';
import { AppLayout } from '@/shared/components/layout/server/AppLayout';

export const metadata: Metadata = {
  title: '価格チェック',
};

export const dynamic = 'force-dynamic';

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppLayout userType='user'>{children}</AppLayout>;
}
