import type { Metadata } from 'next';

import './globals.css';
import ClientAuthStatus from '@/components/auth/ClientAuthStatus';

import Providers from './provider';
import { Footer } from './shared/Footer';
import Nav from './shared/Nav';
import AppIntroLoader from './shared/components/AppIntroLoader';
import { Toaster } from '@/components/ui/sonner';
import { pretendard } from './font';

export const metadata: Metadata = {
  title: 'GameMelier',
  description: '게임 정보 맛보기',
};

// 동기 컴포넌트로 둬서 셸(nav·loading 스켈레톤)을 즉시 flush — 콜드 진입 백지 제거.
// 인증은 ClientAuthStatus 가 클라에서 onAuthStateChange 로 해결(Nav 는 클라 스토어 구독)
// 하므로 레이아웃에서 getUser() 블로킹은 불필요했다. (페이지별 데이터용 getUser 는 각 page 가 따로 호출.)
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className={`${pretendard.variable}`}>
      <body>
        <AppIntroLoader />
        <div className="min-h-screen flex flex-col">
          <Providers>
            <ClientAuthStatus initialUser={null} />
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
