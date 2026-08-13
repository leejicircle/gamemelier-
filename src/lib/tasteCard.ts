import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
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

/**
 * @param client 세션이 있는 클라이언트(본인 조회용). anon 으로 부르면 서버에
 *   auth.uid() 가 없어서 공유 전 본인 카드가 "비공개"로 나온다.
 */
export async function fetchTasteCard(
  userId: string,
  client: SupabaseClient = anon,
): Promise<TasteCard | null> {
  if (!UUID_RE.test(userId)) return null;

  const { data, error } = await client
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
}

/**
 * 보는 사람 기준으로 카드를 가져온다.
 *
 * 본인이면 세션 클라이언트로 조회해야 한다 — anon 으로 부르면 서버에 auth.uid() 가
 * 없어서 공유 전 자기 카드가 비공개로 나온다. OG 이미지에서도 이게 필요하다:
 * 본인이 "이미지 저장"을 누르면 브라우저가 쿠키를 실어 보내므로 자기 카드가 나오고,
 * 쿠키 없는 크롤러는 공유한 카드만 받는다.
 */
export async function fetchTasteCardAsViewer(
  userId: string,
): Promise<{ card: TasteCard | null; isOwner: boolean }> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isOwner = user?.id === userId;

  return {
    card: await fetchTasteCard(userId, isOwner ? supabase : undefined),
    isOwner,
  };
}
