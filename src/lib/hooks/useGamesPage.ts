'use client';

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import type { CardItem } from '@/types/games';

export function useGamesPage(
  page: number = 1,
  pageSize: number = 15,
  genreIds?: number[],
  allowCategories?: string[] | null,
) {
  const limit = Math.max(1, pageSize);
  const offset = Math.max(0, (page - 1) * limit);

  return useQuery({
    queryKey: [
      'games.page.rpc',
      page,
      limit,
      genreIds ?? null,
      allowCategories ?? null,
    ] as const,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_games_cards', {
        p_genre_ids: genreIds && genreIds.length > 0 ? genreIds : null,
        p_allow_categories: allowCategories ?? null,
        p_limit: limit,
        p_offset: offset,
      });
      if (error) throw new Error(error.message);

      const rows = (data ?? []) as Array<{
        id: number;
        name: string;
        image: string | null;
        category: string | null;
        total_count?: number;
      }>;

      const items: CardItem[] = rows.map((r) => ({
        id: r.id,
        name: r.name,
        image: r.image,
        category: r.category ?? '기타',
      }));

      const totalCount = (rows[0]?.total_count ?? 0) as number;
      const hasPrev = page > 1;
      const hasNext = offset + items.length < totalCount;

      return { items, totalCount, hasPrev, hasNext };
    },
    placeholderData: (prev) => prev,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}
