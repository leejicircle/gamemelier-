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

const FUNCTION_URL = process.env.NEXT_PUBLIC_FUNCTION_URL!;
if (!FUNCTION_URL) {
  console.warn('NEXT_PUBLIC_FUNCTION_URL 설정 필요');
}

export async function toggleSaved(gameId: number) {
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!token) throw new Error('로그인이 필요합니다.');

  const res = await fetch(`${FUNCTION_URL}/saved-games/toggle`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ game_id: gameId, source: 'like_button' }),
  });

  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as { saved: boolean };
}

export async function fetchIsSaved(gameId: number) {
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!token) throw new Error('로그인이 필요합니다.');

  const res = await fetch(
    `${FUNCTION_URL}/saved-games/is-saved?game_id=${gameId}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );

  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as { is_saved: boolean };
}

export async function fetchSavedList() {
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!token) throw new Error('로그인이 필요합니다.');

  const url = new URL(`${FUNCTION_URL}/saved-games/list`);

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as {
    items: SavedGameItem[];
    count: number;
  };
}
