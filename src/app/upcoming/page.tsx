import { QueryClient, dehydrate } from '@tanstack/react-query';
import { HydrationBoundary } from '@tanstack/react-query';
import UpcomingClient from './client';
import { createClient } from '@/lib/supabase/server';
import type { CardItem } from '@/types';

type SearchParams = { [key: string]: string | string[] | undefined };
export default async function UpcomingPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const page = Number((params?.page as string) ?? '1') || 1;
  const pageSize = Number((params?.pageSize as string) ?? '30') || 30;

  const limit = Math.max(1, pageSize);
  const offset = Math.max(0, (page - 1) * limit);

  const qc = new QueryClient();
  const supabase = await createClient();

  await qc.prefetchQuery({
    queryKey: ['upcoming.page.rpc', page, limit] as const,
    queryFn: async () => {
      try {
        const { data, error } = await supabase.rpc(
          'list_upcoming_games_cards',
          {
            p_limit: limit,
            p_offset: offset,
          },
        );
        if (error) throw error;

        type Row = {
          id: number;
          name: string;
          image: string | null;
          release_at: string | null;
          release_date_text: string | null;
          total_count: number | null;
        };

        const rows = (data ?? []) as Row[];

        // Steam release_date_text 가 있으면 그대로 노출, 없으면 "출시예정".
        // 클라이언트(useUpcomingCards.ts) 의 formatUpcomingBadge 와 동일 정책.
        const items: (CardItem & { release_at?: string | null })[] = rows.map(
          (r) => {
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
          },
        );

        const totalCount = rows[0]?.total_count ?? 0;
        const hasPrev = page > 1;
        const hasNext = offset + items.length < totalCount;

        return { items, totalCount, hasPrev, hasNext };
      } catch (err) {
        console.error('[UpcomingPage] prefetch error:', err);
        return { items: [], totalCount: 0, hasPrev: page > 1, hasNext: false };
      }
    },
    staleTime: 60_000,
  });

  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <UpcomingClient pageSize={limit} />
    </HydrationBoundary>
  );
}
