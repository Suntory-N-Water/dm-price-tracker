import type { Metadata } from 'next';
import { Noto_Sans_JP } from 'next/font/google';
import { QueryProvider } from '@/shared/components/QueryProvider';
import './globals.css';

const notoSansJp = Noto_Sans_JP({
  variable: '--font-noto-sans-jp',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: {
    default: 'DM Price Tracker',
    template: '%s | DM Price Tracker',
  },
  description: 'デュエル・マスターズカードのメルカリ価格チェック',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang='ja' className={`${notoSansJp.variable} h-full antialiased`}>
      <body className='min-h-full'>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
