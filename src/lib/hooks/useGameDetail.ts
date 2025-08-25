import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import type { PostgrestError } from '@supabase/supabase-js';
import type { GameDetail } from '@/types/games';

export function useGameDetail(id?: number) {
  return useQuery({
    queryKey: ['game-detail', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const {
        data,
        error,
      }: { data: GameDetail | null; error: PostgrestError | null } =
        await supabase
          .rpc('get_game_detail', {
            p_id: id,
            p_currency_primary: 'KRW',
            p_currency_fallback: 'USD',
            p_limit_videos: 6,
            p_limit_screens: 12,
          })
          .single();
      if (error) throw new Error(error.message);
      return data as GameDetail;
    },
    staleTime: 60_000,
  });
}
