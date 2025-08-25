import { QueryClient, dehydrate } from '@tanstack/react-query';
import { HydrationBoundary } from '@tanstack/react-query';
import GameDetailClient from './client';
import { createClient } from '@/lib/supabase/server';

export default async function GameDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const gameId = Number(id);
  if (!Number.isFinite(gameId)) throw new Error('잘못된 게임 ID 입니다.');

  const qc = new QueryClient();
  const supabase = await createClient();

  await qc.prefetchQuery({
    queryKey: ['game-detail', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc('get_game_detail', {
          p_id: id,
          p_currency_primary: 'KRW',
          p_currency_fallback: 'USD',
          p_limit_videos: 6,
          p_limit_screens: 12,
        })
        .single();

      if (error) throw new Error(error.message);
      return data;
    },
    staleTime: 60_000,
  });

  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <GameDetailClient id={gameId} />
    </HydrationBoundary>
  );
}
