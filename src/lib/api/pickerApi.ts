import { supabase } from '@/lib/supabase/client';

/**
 * 온보딩 픽커 — 고른 게임들의 장르·태그로 취향을 시드(seed_taste_from_games RPC).
 * 저장보다 강한 명시 신호("재밌게 했다")라 가중치를 더 준다. RLS는 SECURITY DEFINER + auth.uid().
 */
export async function seedTasteFromGames(gameIds: number[]) {
  if (gameIds.length === 0) return;
  const { error } = await supabase.rpc('seed_taste_from_games', {
    p_game_ids: gameIds,
  });
  if (error) throw error;
}
