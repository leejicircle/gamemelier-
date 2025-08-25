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
import { CardItem } from '@/types';

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

  await qc.prefetchQuery<CardItem[]>({
    queryKey: ['upcoming-cards', limit, offset] as const,
    queryFn: async (): Promise<CardItem[]> => {
      const { data, error } = await supabase.rpc('list_upcoming_games_cards', {
        p_limit: limit,
        p_offset: offset,
      });
      if (error) throw new Error(error.message);

      const rows = (data ?? []) as CardItem[];
      return rows.map(
        (r): CardItem => ({
          id: r.id,
          name: r.name,
          image: r.image,
          category: r.category ?? '기타',
        }),
      );
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
