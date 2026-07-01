import { supabase } from '@/lib/supabase/client';

export type SavedGameItem = {
  saved_at: string;
  id: number;
  name: string;
  metacritic_score: number | null;
  reviews_total: number | null;
  first_release_date: string | null;
  cover_url: string | null;
};

/**
 * 저장 기능은 Supabase 를 클라이언트에서 직접 호출한다.
 * 본인 행만 보고/조작하도록 user_saved_games 의 RLS(auth.uid() = user_id)가 보장한다.
 * (과거에는 Edge Function 을 경유했으나, 단순 CRUD 라 직접 호출로 단순화)
 */

/** 현재 로그인 유저 id. 비로그인이면 throw. (로컬 세션 기반, 네트워크 호출 없음) */
async function requireUserId(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('로그인이 필요합니다.');
  return session.user.id;
}

/** 저장 토글: 이미 저장돼 있으면 해제, 아니면 저장. */
export async function toggleSaved(gameId: number) {
  const userId = await requireUserId();

  const { data: existing, error: selErr } = await supabase
    .from('user_saved_games')
    .select('game_id')
    .eq('user_id', userId)
    .eq('game_id', gameId)
    .maybeSingle();
  if (selErr) throw selErr;

  if (existing) {
    const { error } = await supabase
      .from('user_saved_games')
      .delete()
      .eq('user_id', userId)
      .eq('game_id', gameId);
    if (error) throw error;
    return { saved: false };
  }

  // upsert + ignoreDuplicates 로 멱등 보장: 빠른 연속 클릭으로 INSERT 가 겹쳐도
  // unique violation 없이 조용히 통과한다 (race condition 방어).
  const { error } = await supabase
    .from('user_saved_games')
    .upsert(
      { user_id: userId, game_id: gameId },
      { onConflict: 'user_id,game_id', ignoreDuplicates: true },
    );
  if (error) throw error;
  return { saved: true };
}

/**
 * 현재 유저가 저장한 game_id 전체 집합.
 * 카드마다 개별 조회(fetchIsSaved)하던 N+1 을, 페이지당 1회 조회로 대체한다.
 */
export async function fetchSavedGameIds(): Promise<number[]> {
  const userId = await requireUserId();

  const { data, error } = await supabase
    .from('user_saved_games')
    .select('game_id')
    .eq('user_id', userId);
  if (error) throw error;
  return (data ?? []).map((r) => r.game_id as number);
}

/** 저장한 게임 목록 (games 조인, 최신 저장순). */
export async function fetchSavedList() {
  const userId = await requireUserId();

  const { data, error } = await supabase
    .from('user_saved_games')
    .select(
      'saved_at, games(id, name, metacritic_score, reviews_total, first_release_date, header_image)',
    )
    .eq('user_id', userId)
    .order('saved_at', { ascending: false });
  if (error) throw error;

  type Row = {
    saved_at: string;
    games: {
      id: number;
      name: string;
      metacritic_score: number | null;
      reviews_total: number | null;
      first_release_date: string | null;
      header_image: string | null;
    } | null;
  };

  const items: SavedGameItem[] = ((data ?? []) as unknown as Row[]).map(
    (row) => ({
      saved_at: row.saved_at,
      id: row.games?.id ?? 0,
      name: row.games?.name ?? '',
      metacritic_score: row.games?.metacritic_score ?? null,
      reviews_total: row.games?.reviews_total ?? null,
      first_release_date: row.games?.first_release_date ?? null,
      cover_url: row.games?.header_image ?? null,
    }),
  );

  return { items, count: items.length };
}
