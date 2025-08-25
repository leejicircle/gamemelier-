'use client';

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import type { CardItem } from '@/types';

type RpcUpcomingRow = {
  id: number;
  name: string;
  image: string | null;
  release_at: string | null;
  total_count: number | null;
};

export type PagedResult<T> = {
  items: T[];
  totalCount: number;
  hasPrev: boolean;
  hasNext: boolean;
};

export function useUpcomingCardsPage(page = 1, pageSize = 30) {
  const limit = Math.max(1, pageSize);
  const offset = Math.max(0, (page - 1) * limit);

  return useQuery<PagedResult<CardItem & { release_at?: string | null }>>({
    queryKey: ['upcoming.page.rpc', page, limit] as const,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_upcoming_games_cards', {
        p_limit: limit,
        p_offset: offset,
      });
      if (error) throw error;

      const rows = (data ?? []) as RpcUpcomingRow[];

      const items = rows.map((r) => ({
        id: r.id,
        name: r.name,
        image: r.image,
        release_at: r.release_at,
      })) as (CardItem & { release_at?: string | null })[];

      const totalCount = rows[0]?.total_count ?? 0;
      const hasPrev = page > 1;
      const hasNext = offset + items.length < totalCount;

      return { items, totalCount, hasPrev, hasNext };
    },
    staleTime: 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    placeholderData: (prev) => prev,
  });
}
