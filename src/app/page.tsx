import { Suspense } from 'react';
import Image from 'next/image';
// LCP 요소(장식 배경). Vercel 이미지 최적화 왕복(콜드 지연)을 피하려 미리 압축한
// 정적 WebP(16KB)를 unoptimized 로 엣지 CDN 에서 직접 서빙한다. 원본 = BgImage.png.
import bgImage from '@/assets/BgImageHero.webp';
import MainClient from './mainClient';
import { CardsCarousel } from '@/app/shared/components/CardsCarousel';
import {
  dehydrate,
  HydrationBoundary,
  QueryClient,
} from '@tanstack/react-query';
import { fetchCardsByOrderedIdsServer } from '@/lib/api/topSellers';
import { getTopSellerIds } from '@/lib/steam/topsellers';

import { createClient } from '@/lib/supabase/server';

// 데이터 대기(topsellers live-fetch + RPC)는 이 컴포넌트로 격리한다. page 를 async 로 두면
// hero(LCP)가 await 뒤 스트림 후반에 흘러나와 이미지 발견이 늦어짐(모바일 LCP 13초 회귀).
// hero 는 동기 페이지의 첫 flush 에 태우고, 선반만 Suspense 로 스트리밍.
async function HomeShelves({ limit, offset }: { limit: number; offset: number }) {
  const qc = new QueryClient();
  const supabase = await createClient();

  const idsResp = await qc.fetchQuery({
    queryKey: ['top-seller-ids', limit, offset],
    queryFn: () => getTopSellerIds(limit, offset),
    staleTime: 60_000,
  });

  if (idsResp.ids.length > 0) {
    await qc.prefetchQuery({
      queryKey: ['top-seller-cards', limit, offset, idsResp.ids],
      queryFn: () => fetchCardsByOrderedIdsServer(idsResp.ids),
      staleTime: 60_000,
    });
  }

  // useUpcomingCardsPage(1, 10) 와 동일한 queryKey/반환 형태로 prefetch.
  // 키가 다르면 클라이언트가 캐시 hit 못 하고 재요청 → SSR 효과 무효화.
  await qc.prefetchQuery({
    queryKey: ['upcoming.page.rpc', 1, 10] as const,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_upcoming_games_cards', {
        p_limit: 10,
        p_offset: 0,
      });
      if (error) throw new Error(error.message);

      type Row = {
        id: number;
        name: string;
        image: string | null;
        release_at: string | null;
        release_date_text: string | null;
        total_count: number | null;
      };
      const rows = (data ?? []) as Row[];
      const items = rows.map((r) => {
        const t = (r.release_date_text ?? '').trim();
        const isVague = /^(coming soon|곧 출시|tba|tbd|미정|추후 공지)$/i.test(
          t,
        );
        return {
          id: r.id,
          name: r.name,
          image: r.image,
          category: !t || isVague ? '출시예정' : t,
          release_at: r.release_at,
        };
      });
      const totalCount = rows[0]?.total_count ?? 0;
      return {
        items,
        totalCount,
        hasPrev: false,
        hasNext: items.length < totalCount,
      };
    },
    staleTime: 60_000,
  });

  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <MainClient limit={limit} offset={offset} />
    </HydrationBoundary>
  );
}

export default function MainPage() {
  const limit = 10;
  const offset = 0;

  return (
    <section>
      <div className="absolute top-0 left-0 -z-2 h-[280px] tablet:h-[380px] desktop:h-[445px] w-full">
        <Image
          src={bgImage}
          alt="hero image"
          fill
          priority
          unoptimized
          className="opacity-30 object-cover"
        />
      </div>
      <div className="mt-[80px]">
        <Suspense
          fallback={
            <div className="space-y-[60px] tablet:space-y-[80px] desktop:space-y-[120px] mb-[60px] tablet:mb-[80px] desktop:mb-[120px]">
              <CardsCarousel title="인기게임 TOP" items={[]} isLoading />
              <CardsCarousel title="출시예정" items={[]} isLoading />
            </div>
          }
        >
          <HomeShelves limit={limit} offset={offset} />
        </Suspense>
      </div>
    </section>
  );
}
