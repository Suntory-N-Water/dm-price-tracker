import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getAdminProductsServer } from '@/external/handler/admin-products/query.server';
import { ApiError } from '@/external/handler/api-request.server';
import { AppLayout } from '@/shared/components/layout/server/AppLayout';

export const metadata: Metadata = {
  title: '商品管理',
};

export const dynamic = 'force-dynamic';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    await getAdminProductsServer();
  } catch (error) {
    if (
      error instanceof ApiError &&
      (error.status === 401 || error.status === 403)
    ) {
      redirect('/watches');
    }
    throw error;
  }

  return <AppLayout userType='admin'>{children}</AppLayout>;
}
