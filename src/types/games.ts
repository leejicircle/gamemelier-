/** 추천 이유 배지 종류 (recommend_games_cards.reason_kind) */
export type ReasonKind = 'genre' | 'tag' | 'discount' | 'quality' | 'recency';

export type CardItem = {
  id: number;
  name: string;
  image: string | null;
  category?: string;
  /** 추천 이유 배지 라벨 (예: "취향 장르 · 전략"). 추천 탭에서만 채워짐. */
  reason?: string | null;
  reason_kind?: ReasonKind | null;
};

/** 취향 칩 (get_taste_chips) — share 는 본인 전체 장르 weight 대비 비중(0~1) */
export type TasteChip = {
  genre_id: number;
  name: string;
  weight: number;
  share: number;
};

/** 최근 저장 기반 유사작 한 행 (recommend_from_recent_save) — 앵커명 동봉 */
export type RecentSaveRec = {
  anchor_id: number;
  anchor_name: string;
  id: number;
  name: string;
  image: string | null;
};

/** 찜한 게임 중 할인 중인 항목 (list_saved_on_sale RPC) */
export type SaleItem = {
  id: number;
  name: string;
  image: string | null;
  discount_percent: number;
  initial_cents: number | null;
  final_cents: number | null;
  currency: string | null;
  saved_at: string;
};
export type SavedGameItem = {
  saved_at: string;
  id: number;
  name: string;
  metacritic_score: number | null;
  reviews_total: number | null;
  first_release_date: string | null;
  cover_url: string | null;
};

export type SavedGamesListResponse = {
  items: SavedGameItem[];
  count: number;
};

export type MediaVideo = {
  video_id: number;
  thumbnail: string | null;
  mp4_max: string | null;
};

export type MediaShot = {
  url_full: string;
  url_thumb: string | null;
};

export type GameDetail = {
  id: number;
  name: string;
  summary: string | null;
  header_image: string | null;
  first_release_date: string | null;
  release_date_text: string | null;
  reviews_total: number | null;

  price_currency: string | null;
  price_final_cents: number | null;
  price_initial_cents: number | null;
  discount_percent: number | null;

  developers: string[];
  publishers: string[];
  genres: string[];
  categories: string[];
  platforms: string[];

  videos: MediaVideo[];
  screenshots: MediaShot[];

  requirements_min_html: string | null;
  requirements_rec_html: string | null;

  is_saved: boolean;
};
