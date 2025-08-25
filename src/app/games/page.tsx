import { QueryClient, dehydrate } from '@tanstack/react-query';
import { HydrationBoundary } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/server';
import GamesClient from './client';

export default async function GamesPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const params = await searchParams;
  const page = Number(params.page ?? '1') || 1;
  const pageSize = Number(params.pageSize ?? '15') || 15;
  const genre = Number(params.genre ?? '-1') || -1;

  const qc = new QueryClient();
  const supabase = await createClient();

  await qc.prefetchQuery({
    queryKey: ['games', page, pageSize, genre],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_games_cards', {
        p_limit: pageSize,
        p_offset: (page - 1) * pageSize,
        p_genre_ids: genre === -1 ? null : [genre],
      });
      if (error) throw error;
      return data;
    },
    staleTime: 60_000,
  });

  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <GamesClient ssrPage={page} ssrPageSize={pageSize} ssrGenre={genre} />
    </HydrationBoundary>
  );
}
