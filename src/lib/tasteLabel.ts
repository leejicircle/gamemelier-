export type TasteCard = {
  genres: { name: string; share: number }[];
  tags: string[];
  gameName: string | null;
  gameImage: string | null;
  /** 공유했거나 본인일 때만 true. false 면 서버가 내용을 아예 안 준다. */
  visible: boolean;
  /** 카드 주인 닉네임. 공유 링크로 보는 사람에겐 "당신은"이 틀린 말이라 필요하다. */
  nickname: string | null;
};

/** 카드 첫 줄. 닉네임이 없으면 "당신은"으로 떨어진다. */
export function tasteSubject(nickname?: string | null): string {
  return nickname ? `${nickname}님은` : '당신은';
}

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 장르 12개(게임 장르 전부) → 유형 문구. 나머지는 비게임 장르(유틸리티·교육 등)라
// 취향 1위로 올라올 일이 없어 폴백으로 충분하다.
const GENRE_PHRASE: Record<string, string> = {
  액션: '손맛으로 고르는',
  RPG: '서사에 빠지는',
  전략: '전략을 곱씹는',
  어드벤처: '이야기를 따라가는',
  시뮬레이션: '차곡차곡 쌓는',
  인디: '숨은 보석을 캐는',
  캐주얼: '가볍게 즐기는',
  '무료 플레이': '부담 없이 시작하는',
  '앞서 해보기': '먼저 발 담그는',
  '대규모 멀티플레이어': '사람들 속에서 노는',
  스포츠: '승부를 즐기는',
  레이싱: '속도를 즐기는',
};

/** 상위 장르 1개로 만드는 유형 문구. 조사 문제를 피하려 폴백은 명사형으로 끝낸다. */
export function tasteTitle(topGenre?: string): string {
  if (!topGenre) return '아직 취향을 찾는 중';
  const phrase = GENRE_PHRASE[topGenre];
  return phrase ? `${phrase} 타입` : `${topGenre} 애호가`;
}
