import { QueryClient, dehydrate } from '@tanstack/react-query';
import { HydrationBoundary } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/server';
import GamesClient from './client';

export default async function GamesPage({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  const pageParam = searchParams?.page;
  const pageSizeParam = searchParams?.pageSize;
  const genreParam = searchParams?.genre;

  const page = Number(Array.isArray(pageParam) ? pageParam[0] : pageParam) || 1;
  const pageSize =
    Number(Array.isArray(pageSizeParam) ? pageSizeParam[0] : pageSizeParam) ||
    15;
  const genre =
    Number(Array.isArray(genreParam) ? genreParam[0] : genreParam) || -1;

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
