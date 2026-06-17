'use client';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import type { CardItem } from '@/types';

/**
 * 온보딩 픽커용 인기작 목록(list_picker_games) — 리뷰 많은 순(인지도 높은 게임).
 * RPC 미배포/에러 시 빈 배열.
 */
export function usePickerGames(limit = 24) {
  return useQuery({
    queryKey: ['picker-games', limit],
    queryFn: async (): Promise<CardItem[]> => {
      const { data, error } = await supabase.rpc('list_picker_games', {
        p_limit: limit,
      });
      if (error) {
        console.error('list_picker_games 실패:', error.message);
        return [];
      }
      return (data ?? []) as CardItem[];
    },
    staleTime: 5 * 60_000,
  });
}
