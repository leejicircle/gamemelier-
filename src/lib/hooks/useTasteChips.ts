'use client';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import type { TasteChip } from '@/types';

/**
 * 취향 칩 — 본인 장르 취향 상위 N개 + 비중(get_taste_chips).
 * RLS(본인 행)·INVOKER 라 남의 취향은 안 나온다. RPC 에러 시 빈 배열로 칩 숨김.
 */
export function useTasteChips(userId?: string, limit = 3) {
  return useQuery({
    queryKey: ['taste-chips', userId, limit],
    enabled: !!userId,
    queryFn: async (): Promise<TasteChip[]> => {
      const { data, error } = await supabase.rpc('get_taste_chips', {
        p_user: userId,
        p_limit: limit,
      });
      if (error) {
        console.error('get_taste_chips 실패:', error.message);
        return [];
      }
      return (data ?? []) as TasteChip[];
    },
    staleTime: 60_000,
  });
}
