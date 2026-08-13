'use client';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import type { TasteCard } from '@/lib/tasteCard';

/**
 * 취향 카드 데이터(클라이언트). 팝업에서 쓴다 — 라우트 페이지는 서버에서
 * fetchTasteCard 로 같은 RPC 를 부른다.
 */
export function useTasteCard(userId?: string, enabled = true) {
  return useQuery({
    queryKey: ['taste-card', userId],
    enabled: !!userId && enabled,
    queryFn: async (): Promise<TasteCard | null> => {
      const { data, error } = await supabase
        .rpc('get_taste_card', { p_user: userId })
        .single();

      if (error) {
        console.error('get_taste_card 실패:', error.message);
        return null;
      }

      const row = data as {
        genres: { name: string; share: number }[] | null;
        tags: string[] | null;
        game_name: string | null;
        game_image: string | null;
      };

      return {
        genres: row.genres ?? [],
        tags: row.tags ?? [],
        gameName: row.game_name,
        gameImage: row.game_image,
      };
    },
    staleTime: 60_000,
  });
}
