import type { Metadata } from 'next';

import './globals.css';
import { createClient } from '@/lib/supabase/server';
import ClientAuthStatus from '@/components/auth/ClientAuthStatus';

import Providers from './provider';
import { Footer } from './shared/Footer';
import Nav from './shared/Nav';
import { Toaster } from '@/components/ui/sonner';
import { pretendard } from './font';

export const metadata: Metadata = {
  title: 'GameMelier',
  description: '게임 정보 맛보기',
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return (
    <html lang="ko" className={`${pretendard.variable}`}>
      <body>
        <div className="min-h-screen flex flex-col">
          <Providers>
            <ClientAuthStatus
              initialUser={user ? { id: user.id, email: user.email! } : null}
            />
            <Nav />
            <main className="flex-grow">{children}</main>
            <Toaster richColors position="top-right" />
            <Footer />
          </Providers>
        </div>
      </body>
    </html>
  );
}
