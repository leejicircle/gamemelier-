export type CardItem = {
  id: number;
  name: string;
  image: string | null;
  category?: string;
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
