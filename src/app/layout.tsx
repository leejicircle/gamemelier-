import type { Metadata } from 'next';

// 폰트: 2MB 단일 변수 woff2(next/font preload) → 동적 서브셋(unicode-range, 사용 글리프만
// 5~50KB 조각 로드). 2MB High-priority 요청이 Lighthouse 시뮬레이션 LCP 그래프에 포함되면
// +10초라 점수가 90↔67로 널뛰던 원인. 실사용 폰트 스왑도 빨라짐.
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './globals.css';
import ClientAuthStatus from '@/components/auth/ClientAuthStatus';

import Providers from './provider';
import { Footer } from './shared/Footer';
import Nav from './shared/Nav';
import AppIntroLoader from './shared/components/AppIntroLoader';
import { Toaster } from '@/components/ui/sonner';

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
    <html lang="ko">
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
