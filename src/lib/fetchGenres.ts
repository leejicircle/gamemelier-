import { supabase } from '@/lib/supabase/client';
export type Genre = { id: number; name: string };

export async function saveSignupGenres(genres: string[]) {
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) throw new Error('로그인이 필요합니다.');
  const { error } = await supabase.rpc('set_signup_genres', {
    p_genres: genres,
  });
  if (error) throw error;
}
