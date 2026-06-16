'use client';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import type { RecentSaveRec } from '@/types';

/**
 * 선반 B — 가장 최근 저장한 게임 기준 유사작(recommend_from_recent_save).
 * 앵커명은 각 행의 anchor_name 에 동봉. 저장 0건/RPC 에러 시 빈 배열로 선반 숨김.
 */
export function useRecentSaveRecs(userId?: string, limit = 6) {
  return useQuery({
    queryKey: ['recent-save-recs', userId, limit],
    enabled: !!userId,
    queryFn: async (): Promise<RecentSaveRec[]> => {
      const { data, error } = await supabase.rpc('recommend_from_recent_save', {
        p_user: userId,
        p_limit: limit,
      });
      if (error) {
        console.error('recommend_from_recent_save 실패:', error.message);
        return [];
      }
      return (data ?? []) as RecentSaveRec[];
    },
    staleTime: 60_000,
  });
}
