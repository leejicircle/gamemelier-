'use client';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';

export type TasteTagChip = { tag_id: number; name: string; share: number };

/**
 * 세부 태그 취향 칩 — 본인 태그 취향 상위 N개 + 전체 대비 비중.
 * 장르 칩(get_taste_chips)의 태그 버전. RLS(utp_select_own)가 본인 행만 주므로
 * 별도 RPC 없이 테이블 직접 조회. share = weight / 본인 전체 태그 weight 합.
 */
export function useTasteTagChips(userId?: string, limit = 4) {
  return useQuery({
    queryKey: ['taste-tag-chips', userId, limit],
    enabled: !!userId,
    queryFn: async (): Promise<TasteTagChip[]> => {
      const { data, error } = await supabase
        .from('user_tag_preferences')
        .select('tag_id, weight, tags(name)')
        .gt('weight', 0);
      if (error) {
        console.error('taste tag chips 실패:', error.message);
        return [];
      }
      const rows = (data ?? []) as unknown as {
        tag_id: number;
        weight: number;
        tags: { name: string } | null;
      }[];
      const total = rows.reduce((s, r) => s + r.weight, 0);
      if (total === 0) return [];
      return rows
        .sort((a, b) => b.weight - a.weight)
        .slice(0, limit)
        .map((r) => ({
          tag_id: r.tag_id,
          name: r.tags?.name ?? '',
          share: r.weight / total,
        }))
        .filter((c) => c.name);
    },
    staleTime: 60_000,
  });
}
