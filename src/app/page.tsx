import Image from 'next/image';
import bgImage from '@/assets/BgImage.png';
import MainClient from './mainClient';
import {
  dehydrate,
  HydrationBoundary,
  QueryClient,
} from '@tanstack/react-query';
import {
  fetchCardsByOrderedIdsServer,
  fetchTopSellerIds,
} from '@/lib/api/topSellers';

import { createClient } from '@/lib/supabase/server';

export default async function MainPage() {
  const qc = new QueryClient();
  const supabase = await createClient();
  const limit = 10;
  const offset = 0;

  const idsResp = await qc.fetchQuery({
    queryKey: ['top-seller-ids', limit, offset],
    queryFn: () => fetchTopSellerIds(limit, offset),
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
    <>
      <section>
        <div className="absolute top-0 left-0 -z-2 h-[445px] w-full">
          <Image
            src={bgImage}
            alt="hero image"
            fill
            sizes="100vw"
            priority
            className="opacity-30 object-cover"
          />
        </div>
        <div className="mt-[80px]">
          <HydrationBoundary state={dehydrate(qc)}>
            <MainClient limit={limit} offset={offset} />
          </HydrationBoundary>
        </div>
      </section>
    </>
  );
}
