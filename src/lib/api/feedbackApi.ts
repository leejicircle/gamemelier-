import { supabase } from '@/lib/supabase/client';

/**
 * 게임 피드백 (user_game_feedback).
 * dismissed = '관심 없음' — 추천에서 제외하는 부정 신호.
 * RLS(auth.uid() = user_id)가 본인 행만 보고/조작하도록 보장.
 */

async function requireUserId(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('로그인이 필요합니다.');
  return session.user.id;
}

/** '관심 없음' 표시 — 이후 추천 목록에서 제외된다. */
export async function dismissGame(gameId: number) {
  const userId = await requireUserId();
  const { error } = await supabase
    .from('user_game_feedback')
    .upsert(
      { user_id: userId, game_id: gameId, dismissed: true },
      { onConflict: 'user_id,game_id' },
    );
  if (error) throw error;
}

/** '관심 없음' 취소 (실행취소용). */
export async function undoDismissGame(gameId: number) {
  const userId = await requireUserId();
  const { error } = await supabase
    .from('user_game_feedback')
    .update({ dismissed: false })
    .eq('user_id', userId)
    .eq('game_id', gameId);
  if (error) throw error;
}

/** 내가 '관심 없음' 표시한 게임 id 목록. */
export async function fetchDismissedIds(): Promise<number[]> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('user_game_feedback')
    .select('game_id')
    .eq('user_id', userId)
    .eq('dismissed', true);
  if (error) throw error;
  return (data ?? []).map((r) => r.game_id as number);
}
