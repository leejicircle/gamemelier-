import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { UUID_RE, type TasteCard } from './tasteLabel';

/**
 * 공유 카드 데이터(서버). 공개 요약(get_taste_card)이라 쿠키 세션이 필요 없고,
 * OG 이미지는 비로그인 크롤러가 가져가므로 SSR 클라이언트가 아닌 anon 클라이언트를 쓴다.
 *
 * `server-only` 인 이유: 이 모듈이 클라이언트 번들에 실리면 브라우저에 supabase
 * 클라이언트가 하나 더 생겨 GoTrue 인스턴스가 중복된다(같은 storage key → 경고).
 * 타입·문구는 클라이언트도 쓰므로 tasteLabel.ts 로 분리해뒀다.
 */
const anon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export async function fetchTasteCard(userId: string): Promise<TasteCard | null> {
  if (!UUID_RE.test(userId)) return null;

  const { data, error } = await anon
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
}
