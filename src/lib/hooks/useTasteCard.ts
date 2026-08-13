'use client';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import type { TasteCard } from '@/lib/tasteLabel';

/**
 * 취향 카드 데이터(클라이언트). 팝업에서 쓴다 — 라우트 페이지는 서버에서
 * fetchTasteCard 로 같은 RPC 를 부른다.
 */
export function useTasteCard(userId?: string, enabled = true) {
  return useQuery({
    queryKey: ['taste-card', userId],
    enabled: !!userId && enabled,
    queryFn: async (): Promise<TasteCard> => {
      const { data, error } = await supabase
        .rpc('get_taste_card', { p_user: userId })
        .single();

      // 삼키고 null 을 돌려주면 쿼리가 "성공했는데 데이터 없음"이 되어
      // 팝업이 스켈레톤에 영구히 갇힌다. 던져서 isError 로 드러낸다.
      if (error) throw new Error(error.message);

      const row = data as {
        genres: { name: string; share: number }[] | null;
        tags: string[] | null;
        game_name: string | null;
        game_image: string | null;
        visible: boolean | null;
        nickname: string | null;
      };

      return {
        genres: row.genres ?? [],
        tags: row.tags ?? [],
        gameName: row.game_name,
        gameImage: row.game_image,
        visible: row.visible ?? false,
        nickname: row.nickname,
      };
    },
    staleTime: 60_000,
  });
}
