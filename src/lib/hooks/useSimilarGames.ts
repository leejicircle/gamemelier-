'use client';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import type { CardItem } from '@/types';

/**
 * 기준 게임과 비슷한 게임 (장르 자카드 — v2 태그, v3 임베딩으로 교체 예정).
 * 아이템 기준이라 비로그인도 동작. RPC 미배포/에러 시 빈 배열로 섹션 숨김.
 */
export function useSimilarGames(gameId?: number, limit = 6) {
  return useQuery({
    queryKey: ['similar-games', gameId, limit],
    enabled: !!gameId,
    queryFn: async (): Promise<CardItem[]> => {
      const { data, error } = await supabase.rpc('list_similar_games', {
        p_game_id: gameId,
        p_limit: limit,
      });
      if (error) {
        console.error('list_similar_games 실패:', error.message);
        return [];
      }
      return (data ?? []) as CardItem[];
    },
    staleTime: 5 * 60_000,
  });
}
