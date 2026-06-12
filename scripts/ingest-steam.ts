/**
 * =============================================================================
 * scripts/ingest-steam.ts
 * -----------------------------------------------------------------------------
 * 역할:
 *   현재 public.games 테이블에 있는 모든 게임 ID(Steam appid)에 대해
 *   Steam Store API의 appdetails 엔드포인트를 호출하여, 최신 메타데이터로
 *   다음 테이블들을 갱신한다:
 *
 *     - games                (이름/요약/이미지/출시일/메타크리틱/리뷰수/평판/ccu/refreshed_at)
 *     - covers               (1:1 game_id ↔ 표지 url)
 *     - genres               (lookup, id+name UPSERT)
 *     - categories           (lookup, id+name UPSERT)
 *     - developers           (lookup, name 으로 SELECT-or-INSERT)
 *     - publishers           (lookup, name 으로 SELECT-or-INSERT)
 *     - platforms            (lookup, text id "windows"/"mac"/"linux")
 *     - game_genres          (M:N, 갱신 시 DELETE+INSERT)
 *     - game_categories      (M:N, 갱신 시 DELETE+INSERT)
 *     - game_developers      (M:N, 갱신 시 DELETE+INSERT)
 *     - game_publishers      (M:N, 갱신 시 DELETE+INSERT)
 *     - game_platforms       (M:N, 갱신 시 DELETE+INSERT)
 *     - game_prices          (현재 가격 — UPSERT)
 *     - game_price_history   (가격 스냅샷 — INSERT)
 *     - game_requirements    (시스템 요구사항 — UPSERT)
 *     - game_screenshots     (DELETE + INSERT 전체 교체)
 *     - game_videos          (DELETE + INSERT 전체 교체)
 *     - game_raw_payloads    (Steam 원본 응답 jsonb — UPSERT)
 *     - tags / game_tags     (SteamSpy 유저 태그 — DELETE+INSERT, votes=투표수)
 *
 *   추가로 게임당 다음 외부 API 를 더 호출한다 (실패해도 게임 처리는 계속):
 *     - Steam appreviews  → 평판(positive_ratio·total_positive·total_negative·review_score_desc)
 *     - SteamSpy          → 유저 태그(votes) + 동시접속(ccu)
 *
 * 실행:
 *   npx tsx --env-file=.env.ingest scripts/ingest-steam.ts
 *
 *   환경변수 설정은 .env.ingest 참조 ( .env.ingest.example 템플릿 제공 ).
 *
 * 안전장치:
 *   - service_role 키 사용 → RLS 우회. 클라/공개 환경에 절대 노출 금지.
 *   - Steam API rate limit 회피를 위해 호출 간 지연 적용
 *     (appdetails·appreviews 기본 350ms, SteamSpy 1100ms).
 *   - HTTP 403 수신 즉시 중단 (IP 차단 의심 — 수천 건을 의미 없이 시도하는 것 방지).
 *   - HTTP 429 수신 시 Retry-After 만큼 대기 후 1회 재시도, 또 실패면 중단.
 *   - 게임별 처리 중 에러 발생 시 로그만 남기고 다음 게임으로 진행.
 *   - INGEST_LIMIT 으로 처리 수 제한 가능 (테스트용).
 *   - INGEST_SKIP_FRESH_HOURS 로 최근 갱신된 게임은 스킵 가능 (중단/재개용).
 * =============================================================================
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// -----------------------------------------------------------------------------
// 환경변수 로드 및 클라이언트 생성
// -----------------------------------------------------------------------------

const SUPABASE_URL = process.env.INGEST_SUPABASE_URL;
const SERVICE_KEY = process.env.INGEST_SERVICE_ROLE_KEY;

// 환경변수가 비어있으면 즉시 종료 (실수로 anon key를 쓰는 경우 등 차단).
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    '환경변수 누락: INGEST_SUPABASE_URL / INGEST_SERVICE_ROLE_KEY 를 .env.ingest 에 설정하세요.',
  );
  process.exit(1);
}

// Steam API 호출 시 사용하는 언어/국가 코드. 한국어 + 한국 가격(KRW).
const STEAM_LANG = 'koreana';
const STEAM_CC = 'kr';

// 호출 간 지연(ms). 기본 350ms ≈ 분당 170회.
const DELAY_MS = Number(process.env.INGEST_DELAY_MS ?? 350);

// 처리할 게임 수 제한. 미지정 시 전체.
const LIMIT = process.env.INGEST_LIMIT
  ? Number(process.env.INGEST_LIMIT)
  : undefined;

// refreshed_at 이 N시간 이내면 스킵. 0이면 무시.
const SKIP_FRESH_HOURS = Number(process.env.INGEST_SKIP_FRESH_HOURS ?? 0);

// SteamSpy 호출 간 지연(ms). SteamSpy 자체 권장이 ≈1req/s 라 기본 1100ms.
const STEAMSPY_DELAY_MS = Number(process.env.INGEST_STEAMSPY_DELAY_MS ?? 1100);

// 평판(appreviews)·태그(SteamSpy) 보강 적재 on/off. 'false' 로 끄면 기존 동작.
const FETCH_REVIEWS = process.env.INGEST_FETCH_REVIEWS !== 'false';
const FETCH_TAGS = process.env.INGEST_FETCH_TAGS !== 'false';

// game_tags 에 적재할 태그 상위 개수(투표수 기준). 꼬리표 과다 방지.
const TAG_TOP_N = Number(process.env.INGEST_TAG_TOP_N ?? 20);

// service_role 키로 클라이언트 생성. RLS 우회 가능.
const sb: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// -----------------------------------------------------------------------------
// 타입 정의 — Steam appdetails 응답에서 우리가 사용하는 필드만 정의
// -----------------------------------------------------------------------------

type SteamAppDetailsResponse = Record<
  string,
  { success: boolean; data?: SteamAppData }
>;

type SteamAppData = {
  type?: string;
  name?: string;
  steam_appid?: number;
  short_description?: string;
  header_image?: string;
  release_date?: { coming_soon?: boolean; date?: string };
  developers?: string[];
  publishers?: string[];
  genres?: { id: string; description: string }[];
  categories?: { id: number; description: string }[];
  platforms?: { windows?: boolean; mac?: boolean; linux?: boolean };
  metacritic?: { score?: number; url?: string };
  recommendations?: { total?: number };
  screenshots?: {
    id: number;
    path_full: string;
    path_thumbnail?: string;
  }[];
  movies?: {
    id: number;
    name?: string;
    thumbnail?: string;
    mp4?: { max?: string };
    highlight?: boolean;
  }[];
  price_overview?: {
    currency: string;
    final?: number;
    initial?: number;
    discount_percent?: number;
  };
  // 이 필드는 객체 또는 빈 배열([])로 올 수 있음. 빈 배열인 경우 시스템 요구사항 정보 없음.
  pc_requirements?: { minimum?: string; recommended?: string } | unknown[];
};

/**
 * fetchAppDetails 의 결과 타입.
 *
 * Steam API 호출은 단순 성공/실패가 아닌 여러 케이스가 있고, 각각 호출부의
 * 대응이 달라야 한다 (스킵 / 재시도 / 즉시 중단). 그래서 union 으로 세분화해
 * 호출부가 명시적으로 분기하도록 강제한다.
 *
 *   - ok          : 정상 응답 + data 존재. 그대로 ingestGame 으로 넘김.
 *   - no-data     : success=false 또는 빈 응답. 게임 삭제/지역 제한 등. 스킵.
 *   - rate-limit  : HTTP 429. retryAfterSec 만큼 대기 후 재시도 가능.
 *   - blocked     : HTTP 403. IP 차단 의심 — 루프 즉시 중단해야 함.
 *   - http-error  : 그 외 4xx/5xx. 일시적 장애로 간주, 스킵.
 *   - network     : fetch 자체가 throw. 네트워크 장애, 스킵.
 */
type FetchResult =
  | { kind: 'ok'; data: SteamAppData }
  | { kind: 'no-data' }
  | { kind: 'rate-limit'; retryAfterSec: number }
  | { kind: 'blocked' }
  | { kind: 'http-error'; status: number }
  | { kind: 'network'; message: string };

/** Steam appreviews 의 query_summary 에서 우리가 쓰는 평판 요약. */
type ReviewSummary = {
  positive_ratio: number | null; // total_positive / total_reviews (0~1)
  total_positive: number | null;
  total_negative: number | null;
  review_score_desc: string | null;
};

/** SteamSpy 에서 가져오는 유저 태그(이름→투표수)와 동시 접속. */
type SteamSpyData = {
  tags: { name: string; votes: number }[];
  ccu: number | null;
};

// -----------------------------------------------------------------------------
// 유틸 함수
// -----------------------------------------------------------------------------

/** 지정된 ms 만큼 대기. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Steam 의 한국어 출시일 텍스트를 ISO 8601 timestamptz 로 변환.
 * 패턴 예시:
 *   "2025년 6월 15일"  → 2025-06-14T15:00:00Z (KST 자정 기준)
 *   "2025년 6월"        → 2025-05-31T15:00:00Z (해당 월 1일)
 *   "Coming soon" / "곧 출시" / "미정" 등은 null 반환 (DB 컬럼이 nullable).
 *
 * 주의:
 *   KST(UTC+9) 자정을 UTC로 환산하면 전날 15:00 입니다.
 *   샘플 데이터에서도 "2025-06-15 15:00:00+00" 형태가 보임 — 같은 컨벤션 유지.
 */
function parseKoreanDate(s: string | null | undefined): string | null {
  if (!s) return null;

  // "YYYY년 M월 D일"
  const fullMatch = s.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
  if (fullMatch) {
    const y = parseInt(fullMatch[1], 10);
    const mo = parseInt(fullMatch[2], 10) - 1;
    const d = parseInt(fullMatch[3], 10);
    // KST 00:00 = UTC 전날 15:00
    return new Date(Date.UTC(y, mo, d - 1, 15, 0, 0)).toISOString();
  }

  // "YYYY년 M월" — 해당 월의 1일로 가정
  const monthMatch = s.match(/(\d{4})년\s*(\d{1,2})월/);
  if (monthMatch) {
    const y = parseInt(monthMatch[1], 10);
    const mo = parseInt(monthMatch[2], 10) - 1;
    return new Date(Date.UTC(y, mo, 0, 15, 0, 0)).toISOString();
  }

  // 그 외("미정", "Coming Soon" 등): null
  return null;
}

/**
 * Steam appdetails API 호출.
 *
 * 단순히 null 을 반환하는 대신 FetchResult 로 실패 원인을 구분해 돌려준다.
 * 이렇게 하면 호출부(main 루프)에서 케이스별로 다른 정책을 적용할 수 있다:
 *   - 429 → 대기 후 재시도
 *   - 403 → 루프 즉시 중단
 *   - no-data / network / http-error → 다음 appid 로 진행
 *
 * 이 함수 자체는 로그를 남기지 않는다. 어떤 동작을 했는지(스킵/재시도/중단)는
 * 호출부에서 결정·기록하는 편이 흐름을 따라가기 쉽기 때문.
 */
async function fetchAppDetails(appid: number): Promise<FetchResult> {
  const url =
    `https://store.steampowered.com/api/appdetails` +
    `?appids=${appid}&l=${STEAM_LANG}&cc=${STEAM_CC}`;

  // (1) fetch 자체가 throw 하는 경우 — DNS/네트워크 단절 등
  let res: Response;
  try {
    res = await fetch(url, { headers: { accept: 'application/json' } });
  } catch (e) {
    return { kind: 'network', message: (e as Error).message };
  }

  // (2) IP 차단 — Steam 이 우리 IP 를 막은 케이스. 더 시도해봐야 의미 없음.
  if (res.status === 403) return { kind: 'blocked' };

  // (3) Rate limit — Retry-After 헤더가 있으면 그 만큼 대기하도록 정보 전달.
  //     헤더가 없거나 파싱 실패 시 안전한 기본값 60초 사용.
  if (res.status === 429) {
    const ra = Number(res.headers.get('retry-after') ?? 60);
    return { kind: 'rate-limit', retryAfterSec: Number.isFinite(ra) ? ra : 60 };
  }

  // (4) 그 외 4xx/5xx — 일시적 장애로 간주, 스킵.
  if (!res.ok) return { kind: 'http-error', status: res.status };

  // (5) JSON 파싱 실패 또는 빈 응답
  const json = (await res.json().catch(() => null)) as
    | SteamAppDetailsResponse
    | null;
  if (!json) return { kind: 'no-data' };

  // (6) success=false 또는 data 없음 — 게임 삭제/지역 제한/존재하지 않는 appid
  const entry = json[String(appid)];
  if (!entry || !entry.success || !entry.data) return { kind: 'no-data' };

  return { kind: 'ok', data: entry.data };
}

/**
 * Steam appreviews API 로 리뷰 평판 요약을 가져온다.
 * store.steampowered.com 호스트라 appdetails 와 레이트리밋 풀을 공유한다고 보고,
 * 호출부에서 동일한 DELAY 를 적용한다. 실패는 null 로 돌려 게임 처리를 막지 않는다.
 */
async function fetchReviewSummary(
  appid: number,
): Promise<ReviewSummary | null> {
  const url =
    `https://store.steampowered.com/appreviews/${appid}` +
    `?json=1&language=all&purchase_type=all&num_per_page=0`;
  try {
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) {
      console.warn(`[appreviews ${res.status}] ${appid}`);
      return null;
    }
    const json = (await res.json().catch(() => null)) as {
      success?: number;
      query_summary?: {
        review_score_desc?: string;
        total_positive?: number;
        total_negative?: number;
        total_reviews?: number;
      };
    } | null;
    if (!json || json.success !== 1 || !json.query_summary) return null;

    const q = json.query_summary;
    const total = q.total_reviews ?? 0;
    const pos = q.total_positive ?? 0;
    return {
      positive_ratio: total > 0 ? pos / total : null,
      total_positive: q.total_positive ?? null,
      total_negative: q.total_negative ?? null,
      review_score_desc: q.review_score_desc ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * SteamSpy 로 유저 태그(이름→투표수)와 동시 접속(ccu)을 가져온다.
 * 별도 호스트(steamspy.com)·자체 레이트리밋(≈1req/s)이라 호출부에서
 * STEAMSPY_DELAY_MS 를 적용한다. 실패는 null.
 */
async function fetchSteamSpy(appid: number): Promise<SteamSpyData | null> {
  const url = `https://steamspy.com/api.php?request=appdetails&appid=${appid}`;
  try {
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) {
      console.warn(`[steamspy ${res.status}] ${appid}`);
      return null;
    }
    const json = (await res.json().catch(() => null)) as {
      tags?: Record<string, number> | unknown[];
      ccu?: number;
    } | null;
    if (!json) return null;

    // tags 는 보통 { "태그명": 투표수 } 객체지만, 데이터가 없으면 빈 배열([])로 온다.
    const tags =
      json.tags && !Array.isArray(json.tags)
        ? Object.entries(json.tags).map(([name, votes]) => ({
            name,
            votes: Number(votes) || 0,
          }))
        : [];
    return { tags, ccu: typeof json.ccu === 'number' ? json.ccu : null };
  } catch {
    return null;
  }
}

/**
 * developers / publishers 처럼 Steam 이 ID 없이 이름만 주는 lookup 테이블에서
 * 이름으로 기존 row 를 찾고, 없으면 새로 INSERT 후 id 를 반환.
 *
 * 동시 실행이 없는 단일 스크립트라 race condition 은 무시 가능.
 */
async function ensureLookupByName(
  table: 'developers' | 'publishers',
  name: string,
): Promise<number | null> {
  // 1) 기존 검색
  const { data: existing, error: selErr } = await sb
    .from(table)
    .select('id')
    .eq('name', name)
    .maybeSingle();
  if (selErr) {
    console.warn(`[${table} sel] ${name}: ${selErr.message}`);
    return null;
  }
  if (existing) return existing.id as number;

  // 2) 신규 삽입 (id 는 시퀀스 default 가 자동 부여한다고 가정)
  const { data: inserted, error: insErr } = await sb
    .from(table)
    .insert({ name })
    .select('id')
    .single();
  if (insErr) {
    console.warn(`[${table} ins] ${name}: ${insErr.message}`);
    return null;
  }
  return inserted ? (inserted.id as number) : null;
}

/**
 * tags 테이블에서 이름으로 찾고 없으면 insert 후 id 반환. tags.name 은 unique.
 * 단일 스크립트라 race condition 무시.
 */
async function ensureTag(name: string): Promise<number | null> {
  const { data: existing, error: selErr } = await sb
    .from('tags')
    .select('id')
    .eq('name', name)
    .maybeSingle();
  if (selErr) {
    console.warn(`[tags sel] ${name}: ${selErr.message}`);
    return null;
  }
  if (existing) return existing.id as number;

  const { data: inserted, error: insErr } = await sb
    .from('tags')
    .insert({ name })
    .select('id')
    .single();
  if (insErr) {
    console.warn(`[tags ins] ${name}: ${insErr.message}`);
    return null;
  }
  return inserted ? (inserted.id as number) : null;
}

// -----------------------------------------------------------------------------
// 게임 1건 처리 — 모든 관련 테이블 갱신
// -----------------------------------------------------------------------------

/**
 * 단일 게임에 대한 전체 ingest 파이프라인.
 * games UPDATE → 부속 테이블 UPSERT/REPLACE 순으로 진행.
 *
 * 주의: Steam API 호출은 호출부(main 루프)가 수행하고, 성공한 data 만 인자로
 *      넘긴다. 이 함수는 "data 받으면 DB 에 쓴다"라는 단일 책임만 가진다.
 *      재시도/차단 감지 같은 정책은 main 루프에서 한 곳에 모아 관리한다.
 *
 * 반환값: true = 갱신 성공, false = 부분 실패 (현재는 항상 true 에 가깝다)
 */
async function ingestGame(
  appid: number,
  data: SteamAppData,
  review: ReviewSummary | null,
  spy: SteamSpyData | null,
): Promise<boolean> {
  const now = new Date().toISOString();
  const releaseText = data.release_date?.date ?? null;
  const firstReleaseDate = parseKoreanDate(releaseText);

  // (1) games — UPDATE (id 는 이미 존재함을 전제, INSERT 안 함)
  // 평판(review)·ccu 는 fetch 성공 시에만 포함한다. 실패 시 해당 컬럼을 건드리지
  // 않아, 이전 적재값을 null 로 덮어쓰지 않는다.
  const gameUpdate: Record<string, unknown> = {
    name: data.name ?? '',
    type: data.type ?? null,
    summary: data.short_description ?? null,
    header_image: data.header_image ?? null,
    first_release_date: firstReleaseDate,
    release_date_text: releaseText,
    metacritic_score: data.metacritic?.score ?? null,
    metacritic_url: data.metacritic?.url ?? null,
    reviews_total: data.recommendations?.total ?? null,
    refreshed_at: now,
    updated_at: now,
  };
  if (review) {
    gameUpdate.positive_ratio = review.positive_ratio;
    gameUpdate.total_positive = review.total_positive;
    gameUpdate.total_negative = review.total_negative;
    gameUpdate.review_score_desc = review.review_score_desc;
  }
  if (spy && spy.ccu != null) {
    gameUpdate.ccu = spy.ccu;
  }

  const { error: gameErr } = await sb
    .from('games')
    .update(gameUpdate)
    .eq('id', appid);
  if (gameErr) {
    console.warn(`[games update] ${appid}: ${gameErr.message}`);
  }

  // (2) covers — id = appid 형태 (1:1)
  if (data.header_image) {
    await sb
      .from('covers')
      .upsert(
        { id: appid, url: data.header_image, updated_at: now },
        { onConflict: 'id' },
      );
  }

  // (3) game_raw_payloads — Steam 원본 jsonb 보관 (디버깅/재처리용)
  await sb
    .from('game_raw_payloads')
    .upsert({ game_id: appid, raw: data }, { onConflict: 'game_id' });

  // (4) genres — Steam 의 genre.id 는 숫자 문자열("1","9",..)
  if (Array.isArray(data.genres)) {
    const genreIds: number[] = [];
    for (const g of data.genres) {
      const id = parseInt(g.id, 10);
      if (!Number.isFinite(id)) continue;
      await sb
        .from('genres')
        .upsert({ id, name: g.description }, { onConflict: 'id' });
      genreIds.push(id);
    }
    await sb.from('game_genres').delete().eq('game_id', appid);
    if (genreIds.length > 0) {
      await sb
        .from('game_genres')
        .insert(genreIds.map((genre_id) => ({ game_id: appid, genre_id })));
    }
  }

  // (5) categories — Steam 의 category.id 는 숫자
  if (Array.isArray(data.categories)) {
    for (const c of data.categories) {
      await sb
        .from('categories')
        .upsert({ id: c.id, name: c.description }, { onConflict: 'id' });
    }
    await sb.from('game_categories').delete().eq('game_id', appid);
    if (data.categories.length > 0) {
      await sb.from('game_categories').insert(
        data.categories.map((c) => ({
          game_id: appid,
          category_id: c.id,
        })),
      );
    }
  }

  // (6) developers — 이름만 들어옴, lookup-or-insert 로 id 확보
  if (Array.isArray(data.developers)) {
    const ids: number[] = [];
    for (const name of data.developers) {
      const id = await ensureLookupByName('developers', name);
      if (id != null) ids.push(id);
    }
    await sb.from('game_developers').delete().eq('game_id', appid);
    if (ids.length > 0) {
      await sb
        .from('game_developers')
        .insert(ids.map((developer_id) => ({ game_id: appid, developer_id })));
    }
  }

  // (7) publishers
  if (Array.isArray(data.publishers)) {
    const ids: number[] = [];
    for (const name of data.publishers) {
      const id = await ensureLookupByName('publishers', name);
      if (id != null) ids.push(id);
    }
    await sb.from('game_publishers').delete().eq('game_id', appid);
    if (ids.length > 0) {
      await sb
        .from('game_publishers')
        .insert(ids.map((publisher_id) => ({ game_id: appid, publisher_id })));
    }
  }

  // (8) platforms — id 가 text("windows"/"mac"/"linux")
  const plats: string[] = [];
  if (data.platforms?.windows) plats.push('windows');
  if (data.platforms?.mac) plats.push('mac');
  if (data.platforms?.linux) plats.push('linux');
  for (const id of plats) {
    await sb.from('platforms').upsert({ id }, { onConflict: 'id' });
  }
  await sb.from('game_platforms').delete().eq('game_id', appid);
  if (plats.length > 0) {
    await sb
      .from('game_platforms')
      .insert(plats.map((platform_id) => ({ game_id: appid, platform_id })));
  }

  // (9) prices — 현재가 + 히스토리 스냅샷
  if (data.price_overview) {
    const p = data.price_overview;
    await sb.from('game_prices').upsert(
      {
        game_id: appid,
        currency: p.currency,
        final_cents: p.final ?? null,
        initial_cents: p.initial ?? null,
        discount_percent: p.discount_percent ?? null,
        fetched_at: now,
      },
      { onConflict: 'game_id,currency' },
    );

    await sb.from('game_price_history').insert({
      game_id: appid,
      currency: p.currency,
      final_cents: p.final ?? null,
      initial_cents: p.initial ?? null,
      discount_percent: p.discount_percent ?? null,
      captured_at: now,
    });
  }

  // (10) game_requirements — pc_requirements 가 객체일 때만 처리
  if (
    data.pc_requirements &&
    !Array.isArray(data.pc_requirements) &&
    typeof data.pc_requirements === 'object'
  ) {
    const req = data.pc_requirements as {
      minimum?: string;
      recommended?: string;
    };
    if (req.minimum || req.recommended) {
      await sb.from('game_requirements').upsert(
        {
          game_id: appid,
          minimum_html: req.minimum ?? null,
          recommended_html: req.recommended ?? null,
        },
        { onConflict: 'game_id' },
      );
    }
  }

  // (11) screenshots — 전체 교체
  await sb.from('game_screenshots').delete().eq('game_id', appid);
  if (Array.isArray(data.screenshots) && data.screenshots.length > 0) {
    await sb.from('game_screenshots').insert(
      data.screenshots.map((s) => ({
        game_id: appid,
        shot_id: s.id,
        url_full: s.path_full,
        url_thumb: s.path_thumbnail ?? null,
      })),
    );
  }

  // (12) videos — 전체 교체
  await sb.from('game_videos').delete().eq('game_id', appid);
  if (Array.isArray(data.movies) && data.movies.length > 0) {
    await sb.from('game_videos').insert(
      data.movies.map((m) => ({
        game_id: appid,
        video_id: m.id,
        name: m.name ?? null,
        thumbnail: m.thumbnail ?? null,
        mp4_max: m.mp4?.max ?? null,
        highlight: m.highlight ?? null,
      })),
    );
  }

  // (13) game_tags — SteamSpy 태그(이름→투표수) 상위 N개. 전체 교체.
  //       spy 가 null(fetch 실패)이거나 태그가 없으면 기존 태그를 보존한다.
  if (spy && spy.tags.length > 0) {
    const top = [...spy.tags]
      .sort((a, b) => b.votes - a.votes)
      .slice(0, TAG_TOP_N);
    const rows: { game_id: number; tag_id: number; votes: number }[] = [];
    for (const t of top) {
      const tagId = await ensureTag(t.name);
      if (tagId != null) {
        rows.push({ game_id: appid, tag_id: tagId, votes: t.votes });
      }
    }
    // rows 가 비어 있으면(ensureTag 가 전부 실패) DELETE 도 건너뛴다.
    // 그러지 않으면 일시적 쓰기 오류로 기존 태그가 통째로 사라질 수 있다.
    if (rows.length > 0) {
      await sb.from('game_tags').delete().eq('game_id', appid);
      await sb.from('game_tags').insert(rows);
    }
  }

  console.log(`[ok]   ${appid}  ${data.name ?? '(no name)'}`);
  return true;
}

// -----------------------------------------------------------------------------
// 메인 — 게임 목록 조회 후 순차 처리
// -----------------------------------------------------------------------------

async function main() {
  console.log(`> Steam ingest 시작`);
  console.log(`  delay: ${DELAY_MS}ms / limit: ${LIMIT ?? '전체'} / skipFresh: ${SKIP_FRESH_HOURS}h`);

  // ---------------------------------------------------------------------------
  // 처리 대상 게임 ID 조회
  //
  // games 테이블 전체를 가져온 뒤 JS 레벨에서 SKIP_FRESH_HOURS / LIMIT 을 적용.
  // 쿼리에 재할당이 없으므로 const 사용.
  // ---------------------------------------------------------------------------
  const { data: rows, error } = await sb
    .from('games')
    .select('id, refreshed_at')
    .order('id');
  if (error) {
    console.error('games 조회 실패:', error.message);
    process.exit(1);
  }
  if (!rows || rows.length === 0) {
    console.error('games 테이블이 비어있음.');
    process.exit(1);
  }

  // refreshed_at 이 cutoff 보다 오래된 게임만 처리 대상에 포함.
  // SKIP_FRESH_HOURS=0 이면 cutoff 가 null 이고 모두 통과.
  const cutoff =
    SKIP_FRESH_HOURS > 0
      ? Date.now() - SKIP_FRESH_HOURS * 3600 * 1000
      : null;

  const filtered = rows.filter((r) => {
    if (!cutoff) return true;
    if (!r.refreshed_at) return true;
    return new Date(r.refreshed_at as string).getTime() < cutoff;
  });

  // 테스트용 LIMIT 적용
  const target = LIMIT ? filtered.slice(0, LIMIT) : filtered;
  console.log(`  대상 ${target.length}건 (전체 ${rows.length}, 신선 스킵 ${rows.length - filtered.length})\n`);

  // ---------------------------------------------------------------------------
  // 순차 처리 루프
  //
  // 각 appid 에 대해:
  //   1) fetchAppDetails 로 Steam API 호출
  //   2) 결과 종류(FetchResult.kind) 에 따라 분기
  //      - rate-limit : Retry-After 만큼 대기 후 1회 재시도. 또 429 면 abort.
  //      - blocked    : IP 차단 — 더 시도해봐야 무의미하므로 즉시 break.
  //      - ok         : ingestGame 호출해서 DB 반영.
  //      - 그 외       : 로그만 남기고 다음 appid 로 진행.
  //   3) 호출 간 DELAY_MS 대기 (rate limit 회피).
  // ---------------------------------------------------------------------------
  let ok = 0;
  let fail = 0;
  const startedAt = Date.now();

  for (let i = 0; i < target.length; i++) {
    const appid = target[i].id as number;

    // (1) Steam API 호출
    let result = await fetchAppDetails(appid);

    // (2-a) 429 — 한 번만 재시도. Retry-After 의 2배까지 보수적으로 대기 (최대 5분).
    if (result.kind === 'rate-limit') {
      const wait = Math.min(result.retryAfterSec * 2 * 1000, 5 * 60 * 1000);
      console.warn(
        `[429] ${appid}: ${result.retryAfterSec}s 권고, 실제 ${Math.round(wait / 1000)}s 대기 후 재시도`,
      );
      await sleep(wait);
      result = await fetchAppDetails(appid);
      if (result.kind === 'rate-limit') {
        console.error(`[abort] ${appid}: 재시도 후에도 429. 중단.`);
        break;
      }
    }

    // (2-b) 403 — IP 차단 의심. 루프 즉시 중단.
    if (result.kind === 'blocked') {
      console.error(`[abort] ${appid}: HTTP 403 — IP 차단 의심. 중단.`);
      break;
    }

    // (2-c) 나머지 케이스 분기.
    //       default 의 never 단언이 FetchResult 에 새 kind 가 추가되면 컴파일 에러로 잡아준다.
    switch (result.kind) {
      case 'network':
        console.warn(`[net-err] ${appid}: ${result.message}`);
        fail++;
        break;
      case 'http-error':
        console.warn(`[http ${result.status}] ${appid}`);
        fail++;
        break;
      case 'no-data':
        console.warn(`[skip] ${appid}: appdetails 응답 없음`);
        fail++;
        break;
      case 'ok':
        // (2-d) 정상 — 평판(appreviews)·태그(SteamSpy)를 추가로 가져와
        //       ingestGame 에 주입해 DB 반영. 각 fetch 는 실패해도 null 로
        //       돌아와 게임 처리를 막지 않는다.
        try {
          let review: ReviewSummary | null = null;
          let spy: SteamSpyData | null = null;
          // appreviews 는 store 호스트라 appdetails 와 한도 공유 → DELAY 적용
          if (FETCH_REVIEWS) {
            await sleep(DELAY_MS);
            review = await fetchReviewSummary(appid);
          }
          // SteamSpy 는 별도 호스트·자체 한도(≈1req/s) → STEAMSPY_DELAY 적용
          if (FETCH_TAGS) {
            await sleep(STEAMSPY_DELAY_MS);
            spy = await fetchSteamSpy(appid);
          }
          const r = await ingestGame(appid, result.data, review, spy);
          if (r) ok++;
          else fail++;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error(`[err]  ${appid}: ${msg}`);
          fail++;
        }
        break;
      default: {
        const _exhaustive: never = result;
        void _exhaustive;
      }
    }

    // 25건마다 진행률 보고
    if ((i + 1) % 25 === 0 || i === target.length - 1) {
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
      console.log(
        `  --- ${i + 1}/${target.length}  ok=${ok} fail=${fail}  (${elapsed}s) ---`,
      );
    }

    // (3) 다음 호출까지 대기 — rate limit 회피
    if (i < target.length - 1) await sleep(DELAY_MS);
  }

  const total = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`\n> 완료. ok=${ok} fail=${fail} (총 ${total}s)`);
}

// 최상위 await 회피용 IIFE
main().catch((e) => {
  console.error('치명적 오류:', e);
  process.exit(1);
});
