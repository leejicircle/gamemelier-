'use client';

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import type { CardItem } from '@/types';

type RpcUpcomingRow = {
  id: number;
  name: string;
  image: string | null;
  release_at: string | null;
  release_date_text: string | null;
  total_count: number | null;
};

// Steam 의 release_date_text 가 비어있거나 모호 표현이면 "출시예정"으로 정규화.
// 그 외("2026년 1분기", "2026년 3월" 등)는 원본 텍스트 그대로 노출.
function formatUpcomingBadge(text: string | null | undefined): string {
  const t = (text ?? '').trim();
  if (!t) return '출시예정';
  if (/^(coming soon|곧 출시|tba|tbd|미정|추후 공지)$/i.test(t)) {
    return '출시예정';
  }
  return t;
}

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
        // 카드 하단 배지로 표시될 텍스트.
        // Steam 의 원본 한국어 문구("2026년 1분기" 등)를 우선,
        // 모호하거나 비어있으면 "출시예정"으로 fallback.
        category: formatUpcomingBadge(r.release_date_text),
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
