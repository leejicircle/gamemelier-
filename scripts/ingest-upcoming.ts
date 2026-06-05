/**
 * =============================================================================
 * scripts/ingest-upcoming.ts
 * -----------------------------------------------------------------------------
 * 역할:
 *   Steam Store 의 "출시예정(Coming Soon)" 카테고리에서 게임 N개를 발견하고,
 *   public.games (및 부속 테이블)에 신규 INSERT/갱신한다.
 *
 *   ingest-steam.ts 가 "기존 게임 갱신(UPDATE)" 용도라면, 이 파일은
 *   "신규 게임 추가(INSERT/UPSERT)" 용도다. 두 파일은 독립적으로 실행 가능하며
 *   서로의 동작에 영향을 주지 않는다.
 *
 * 처리 흐름:
 *   1) Steam search HTML 에서 출시예정 게임 appid 들을 추출 (기존 topsellers
 *      라우트와 동일한 패턴 — `data-ds-appid="..."` 정규식).
 *   2) 각 appid 에 대해 Steam appdetails 호출.
 *   3) coming_soon == true 인 게임만 통과 (false면 이미 출시되어 일반
 *      카탈로그로 이동한 케이스).
 *   4) games UPSERT + 모든 부속 테이블 갱신.
 *
 * 갱신되는 테이블 (ingest-steam.ts 와 동일):
 *   games, covers, genres, categories, developers, publishers, platforms,
 *   game_genres, game_categories, game_developers, game_publishers,
 *   game_platforms, game_prices, game_price_history, game_requirements,
 *   game_screenshots, game_videos, game_raw_payloads
 *
 * 실행:
 *   npx tsx --env-file=.env.ingest scripts/ingest-upcoming.ts
 *
 * 환경변수:
 *   INGEST_SUPABASE_URL          (필수) Supabase URL
 *   INGEST_SERVICE_ROLE_KEY      (필수) service_role 키
 *   INGEST_UPCOMING_COUNT        (옵션) 추가할 게임 수. 기본 80.
 *   INGEST_DELAY_MS              (옵션) Steam API 호출 간 지연. 기본 600ms.
 *   INGEST_MAX_CONSECUTIVE_SKIPS (옵션) 연속 스킵 임계값. 기본 15.
 *   INGEST_MAX_CONSECUTIVE_ERRORS(옵션) 연속 에러 임계값. 기본 5.
 *
 * 안전장치:
 *   - HTTP 403 수신 즉시 중단 (IP 차단 의심)
 *   - HTTP 429 수신 시 Retry-After 만큼 대기 후 재시도, 또 실패면 중단
 *   - 연속 스킵 N회 / 연속 에러 N회 초과 시 중단
 *   - 중단 시점까지 처리한 게임은 DB에 정상 반영됨 (트랜잭션 단위가 게임별)
 *
 * 주의:
 *   service_role 키는 RLS 를 우회하므로 .env.ingest 외부로 노출 금지.
 * =============================================================================
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// -----------------------------------------------------------------------------
// 환경변수 로드 및 클라이언트 생성
// -----------------------------------------------------------------------------

const SUPABASE_URL = process.env.INGEST_SUPABASE_URL;
const SERVICE_KEY = process.env.INGEST_SERVICE_ROLE_KEY;

// 환경변수 누락 시 즉시 종료. anon 키 실수 사용 등을 차단.
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    '환경변수 누락: INGEST_SUPABASE_URL / INGEST_SERVICE_ROLE_KEY 를 .env.ingest 에 설정하세요.',
  );
  process.exit(1);
}

// Steam API 호출 시 사용하는 언어/국가 코드 — 한국어 + 한국 가격(KRW)
const STEAM_LANG = 'koreana';
const STEAM_CC = 'kr';

// 가져올 출시예정 게임 수 (기본 80)
const UPCOMING_COUNT = Number(process.env.INGEST_UPCOMING_COUNT ?? 80);

// Steam API 호출 사이 지연(ms). 기본 600ms ≈ 분당 100회.
const DELAY_MS = Number(process.env.INGEST_DELAY_MS ?? 600);

// 안전장치 임계값. 이 이상 연속 발생하면 중단 (IP 차단 / 네트워크 장애 의심).
const MAX_CONSECUTIVE_SKIPS = Number(
  process.env.INGEST_MAX_CONSECUTIVE_SKIPS ?? 15,
);
const MAX_CONSECUTIVE_ERRORS = Number(
  process.env.INGEST_MAX_CONSECUTIVE_ERRORS ?? 5,
);

// service_role 키로 클라이언트 생성. RLS 우회.
const sb: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// -----------------------------------------------------------------------------
// 타입 정의 — Steam appdetails / search 응답에서 사용하는 필드만 선언
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
  pc_requirements?: { minimum?: string; recommended?: string } | unknown[];
};

// Steam search HTML 응답 형태
type SteamSearchResponse = { results_html?: string };

// fetchAppDetails 의 결과 타입. 안전장치를 위해 상태를 세분화한다.
type FetchResult =
  | { kind: 'ok'; data: SteamAppData }
  | { kind: 'no-data' } // success=false 또는 빈 응답 (게임 삭제/지역 제한 등)
  | { kind: 'rate-limit'; retryAfterSec: number } // HTTP 429
  | { kind: 'blocked' } // HTTP 403 (IP 차단 의심)
  | { kind: 'http-error'; status: number } // 그 외 4xx/5xx
  | { kind: 'network' }; // 네트워크 자체 에러

// -----------------------------------------------------------------------------
// 유틸 함수
// -----------------------------------------------------------------------------

/** 지정된 ms 만큼 비동기 대기. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * KST 자정에 해당하는 UTC ISO 문자열을 만든다.
 * (KST = UTC+9 → 자정 KST = 전날 15:00 UTC)
 */
function kstMidnightToIso(y: number, monthZeroBased: number, d: number): string {
  return new Date(Date.UTC(y, monthZeroBased, d - 1, 15, 0, 0)).toISOString();
}

/**
 * Steam 의 한국어 출시일 텍스트를 ISO 8601 timestamptz 로 변환.
 *
 * 출시예정 게임은 다양한 모호 표현이 등장하므로 가능한 많은 패턴을 처리한다.
 * 변환 우선순위:
 *   1) 정확한 날짜  "YYYY년 M월 D일"
 *   2) 월 단위       "YYYY년 M월"  → 해당 월 1일
 *   3) 분기 표현     "YYYY년 N분기" → 해당 분기 시작 월 1일 (1=1월, 2=4월, 3=7월, 4=10월)
 *   4) 계절          "YYYY년 봄/여름/가을/겨울" → 4/7/10/12월 1일
 *   5) 반기          "YYYY년 상반기/하반기" → 3/9월 31일
 *   6) 시점          "YYYY년 초/중반/후반/말" → 3/6/9/11월 1일
 *   7) 연도만         "YYYY"  → 해당 연도 12월 31일
 *   그 외 → null
 *
 * 일반적인 영어 패턴("Coming soon", "TBA", "Q1 2026") 도 일부 처리.
 */
function parseKoreanDate(s: string | null | undefined): string | null {
  if (!s) return null;
  const text = s.trim();
  if (!text) return null;

  // (1) "YYYY년 M월 D일"
  const full = text.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
  if (full) {
    return kstMidnightToIso(+full[1], +full[2] - 1, +full[3]);
  }

  // (2) "YYYY년 M월"
  const month = text.match(/(\d{4})년\s*(\d{1,2})월(?!\s*\d)/);
  if (month) {
    return kstMidnightToIso(+month[1], +month[2] - 1, 1);
  }

  // (3) "YYYY년 N분기" — 1Q=1월, 2Q=4월, 3Q=7월, 4Q=10월
  const quarterKor = text.match(/(\d{4})년\s*([1-4])\s*분기/);
  if (quarterKor) {
    const y = +quarterKor[1];
    const q = +quarterKor[2];
    return kstMidnightToIso(y, (q - 1) * 3, 1);
  }
  // 영어: "Q1 2026" / "Q4 2026"
  const quarterEng = text.match(/Q([1-4])\s*(\d{4})/i);
  if (quarterEng) {
    const q = +quarterEng[1];
    const y = +quarterEng[2];
    return kstMidnightToIso(y, (q - 1) * 3, 1);
  }

  // (4) 계절
  const season = text.match(/(\d{4})년\s*(봄|여름|가을|겨울)/);
  if (season) {
    const y = +season[1];
    const map: Record<string, number> = { 봄: 3, 여름: 6, 가을: 9, 겨울: 11 };
    return kstMidnightToIso(y, map[season[2]], 1);
  }

  // (5) 반기
  const half = text.match(/(\d{4})년\s*(상반기|하반기)/);
  if (half) {
    const y = +half[1];
    return half[2] === '상반기'
      ? kstMidnightToIso(y, 5, 30) // 6월 30일 (상반기 끝)
      : kstMidnightToIso(y, 11, 31); // 12월 31일 (하반기 끝)
  }

  // (6) 시점 — 초/중반/후반/말
  const phase = text.match(/(\d{4})년\s*(초|중반|후반|말)/);
  if (phase) {
    const y = +phase[1];
    const map: Record<string, [number, number]> = {
      초: [2, 1], // 3월 1일
      중반: [5, 1], // 6월 1일
      후반: [8, 1], // 9월 1일
      말: [10, 1], // 11월 1일
    };
    const [m, d] = map[phase[2]];
    return kstMidnightToIso(y, m, d);
  }

  // (7) 연도만 — "2026"
  const yearOnly = text.match(/^\s*(\d{4})\s*$/);
  if (yearOnly) {
    const y = +yearOnly[1];
    return kstMidnightToIso(y, 11, 31);
  }

  return null;
}

/**
 * Steam appdetails 응답의 release_date 로부터 first_release_date 결정.
 *
 * 정책:
 *   - 파싱된 날짜가 있으면 그대로 사용 (과거든 미래든).
 *     과거이면 RPC `release_at > now()` 필터에서 자연스럽게 제외됨.
 *     의도: Steam 이 알려준 명시적 날짜를 신뢰. 출시 연기나 발매 직후
 *     아직 coming_soon=true 인 게임은 출시예정 목록에 노출하지 않음
 *     (사용자에게 모순된 정보 — "오늘 출시예정" 같은 — 를 보여주지 않기 위해).
 *
 *   - 파싱이 완전히 실패한 경우(null) 만 +6개월 fallback 적용.
 *     이건 "Coming Soon", "TBA", "미정", 빈 문자열 등 Steam 이 구체적
 *     날짜를 모르는 케이스. coming_soon=true 와 결합하면 출시예정 페이지
 *     에 노출하기 위해 임시 미래 날짜가 필요함.
 *
 * coming_soon=false 인 게임은 호출부에서 이미 스킵되므로 이 함수가 불릴
 * 일이 거의 없음. 안전망으로 parsed 그대로 반환.
 */
function decideReleaseDate(
  parsed: string | null,
  comingSoon: boolean,
): string | null {
  if (!comingSoon) return parsed;
  if (parsed) return parsed;
  // 파싱 자체가 실패한 모호 텍스트만 fallback 적용
  return new Date(Date.now() + 1000 * 60 * 60 * 24 * 30 * 6).toISOString();
}

/**
 * Steam search HTML 응답에서 appid 들을 추출.
 * `data-ds-appid="12345"` 패턴을 정규식으로 캐치.
 */
function extractIdsFromSearchHtml(html: string): number[] {
  const re = /data-ds-appid="(\d+)"/g;
  const ids: number[] = [];
  for (const m of html.matchAll(re)) {
    const id = Number(m[1]);
    if (Number.isFinite(id)) ids.push(id);
  }
  return ids;
}

/**
 * Steam search 페이지에서 출시예정 게임 appid 를 N개 수집.
 *
 * 동작:
 *   - count 만큼 모일 때까지 페이지를 넘기며 호출
 *   - 중복 appid 는 자동 제거
 *   - 빈 페이지가 나오거나 시도 한도 도달 시 종료
 *
 * URL 파라미터:
 *   filter=comingsoon  — 출시예정 게임만
 *   category1=998      — '게임' 카테고리 (소프트웨어/DLC 제외)
 *   infinite=1         — JSON 형식으로 응답 받기
 */
async function discoverUpcomingAppIds(count: number): Promise<number[]> {
  const collected: number[] = [];
  const seen = new Set<number>();

  let start = 0;
  const pageSize = Math.min(count, 100); // 한 번에 너무 많이 받지 않도록
  let attempts = 0;
  const MAX_ATTEMPTS = 10;

  while (collected.length < count && attempts < MAX_ATTEMPTS) {
    const url =
      `https://store.steampowered.com/search/results/` +
      `?start=${start}&count=${pageSize}&filter=comingsoon&category1=998` +
      `&cc=${STEAM_CC}&l=${STEAM_LANG}&infinite=1`;

    let res: Response;
    try {
      res = await fetch(url, { headers: { accept: 'application/json' } });
    } catch (e) {
      console.warn(`[discover net-err]`, (e as Error).message);
      break;
    }
    if (!res.ok) {
      console.warn(`[discover http ${res.status}] start=${start}`);
      break;
    }

    const data = (await res
      .json()
      .catch(() => ({}))) as SteamSearchResponse;
    const html =
      typeof data.results_html === 'string' ? data.results_html : '';
    if (!html) break;

    const ids = extractIdsFromSearchHtml(html);
    if (ids.length === 0) break;

    for (const id of ids) {
      if (!seen.has(id)) {
        seen.add(id);
        collected.push(id);
        if (collected.length >= count) break;
      }
    }

    start += pageSize;
    attempts++;
  }

  return collected.slice(0, count);
}

/**
 * Steam appdetails API 호출 (안전장치 포함).
 *
 * 다양한 실패 케이스를 구분된 결과로 반환해 호출부에서
 * 차단/재시도/스킵을 적절히 처리할 수 있도록 한다.
 */
async function fetchAppDetails(appid: number): Promise<FetchResult> {
  const url =
    `https://store.steampowered.com/api/appdetails` +
    `?appids=${appid}&l=${STEAM_LANG}&cc=${STEAM_CC}`;

  let res: Response;
  try {
    res = await fetch(url, { headers: { accept: 'application/json' } });
  } catch {
    return { kind: 'network' };
  }

  // 차단 — IP 단위로 막힌 케이스
  if (res.status === 403) return { kind: 'blocked' };

  // Rate limit — Retry-After 헤더가 있으면 그 만큼 대기 후 재시도하도록 정보 전달
  if (res.status === 429) {
    const ra = Number(res.headers.get('retry-after') ?? 60);
    return { kind: 'rate-limit', retryAfterSec: Number.isFinite(ra) ? ra : 60 };
  }

  if (!res.ok) return { kind: 'http-error', status: res.status };

  const json = (await res.json().catch(() => null)) as
    | SteamAppDetailsResponse
    | null;
  if (!json) return { kind: 'no-data' };

  const entry = json[String(appid)];
  if (!entry || !entry.success || !entry.data) return { kind: 'no-data' };
  return { kind: 'ok', data: entry.data };
}

/**
 * developers / publishers 테이블에서 이름으로 row 를 찾고, 없으면 INSERT.
 * id 는 시퀀스 default 가 자동 부여한다고 가정.
 */
async function ensureLookupByName(
  table: 'developers' | 'publishers',
  name: string,
): Promise<number | null> {
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

// -----------------------------------------------------------------------------
// 게임 1건 처리 — INSERT(UPSERT) 방식. ingest-steam.ts 와 다른 점은 (1) 단계만.
// -----------------------------------------------------------------------------

/**
 * 단일 출시예정 게임을 DB에 추가/갱신.
 * 반환값: true = 추가/갱신 성공, false = 데이터 없음 또는 부분 실패
 */
async function upsertUpcomingGame(appid: number, data: SteamAppData) {
  const now = new Date().toISOString();
  const releaseText = data.release_date?.date ?? null;
  // Steam release_date.date 텍스트 → ISO 날짜.
  // coming_soon=true 이면서 파싱 실패/과거이면 +6개월 fallback 으로 보정.
  // (Steam comingsoon 필터에는 출시 연기되어 옛 일정인 게임이 다수 포함되어
  //  RPC 의 `release_at > now()` 조건을 통과시키려면 미래 날짜가 필요)
  const comingSoon = data.release_date?.coming_soon === true;
  const firstReleaseDate = decideReleaseDate(
    parseKoreanDate(releaseText),
    comingSoon,
  );

  // (1) covers — 먼저 UPSERT.
  //     games.cover_id 가 covers.id 를 참조하는 외래키이므로,
  //     신규 게임 INSERT 시 covers row 가 먼저 존재해야 한다.
  //     header_image 가 없으면 cover_id 를 null 로 두고 진행.
  let coverId: number | null = null;
  if (data.header_image) {
    const { error: coverErr } = await sb
      .from('covers')
      .upsert(
        { id: appid, url: data.header_image, updated_at: now },
        { onConflict: 'id' },
      );
    if (coverErr) {
      console.warn(`[covers upsert] ${appid}: ${coverErr.message}`);
    } else {
      coverId = appid;
    }
  }

  // (2) games — UPSERT (id 중복 시 갱신, 없으면 신규 INSERT).
  //     기존 ingest-steam.ts 와 가장 큰 차이점.
  const { error: gameErr } = await sb.from('games').upsert(
    {
      id: appid,
      name: data.name ?? '(제목 없음)',
      type: data.type ?? null,
      summary: data.short_description ?? null,
      header_image: data.header_image ?? null,
      first_release_date: firstReleaseDate,
      release_date_text: releaseText,
      metacritic_score: data.metacritic?.score ?? null,
      metacritic_url: data.metacritic?.url ?? null,
      reviews_total: data.recommendations?.total ?? null,
      cover_id: coverId, // covers 에 INSERT 성공한 경우만 참조
      refreshed_at: now,
      updated_at: now,
    },
    { onConflict: 'id' },
  );
  if (gameErr) {
    console.warn(`[games upsert] ${appid}: ${gameErr.message}`);
    return false; // games 가 없으면 부속 테이블 FK 제약 위반함 — 중단
  }

  // (3) game_raw_payloads — Steam 원본 jsonb 보관
  await sb
    .from('game_raw_payloads')
    .upsert({ game_id: appid, raw: data }, { onConflict: 'game_id' });

  // (4) genres
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

  // (5) categories
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

  // (6) developers
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

  // (8) platforms — text id ("windows"/"mac"/"linux")
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

  // (9) prices — 출시예정 게임은 가격이 없는 경우가 많음 (price_overview undefined)
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

  // (10) game_requirements
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

  return true;
}

// -----------------------------------------------------------------------------
// 메인 — 발견 → 순차 처리 → 안전장치
// -----------------------------------------------------------------------------

async function main() {
  console.log(`> 출시예정 게임 ingest 시작`);
  console.log(
    `  count: ${UPCOMING_COUNT} / delay: ${DELAY_MS}ms / 안전장치: skip<=${MAX_CONSECUTIVE_SKIPS} err<=${MAX_CONSECUTIVE_ERRORS}\n`,
  );

  // (1) 출시예정 appid 발견
  console.log('> Steam search 에서 출시예정 appid 수집 중...');
  const appids = await discoverUpcomingAppIds(UPCOMING_COUNT);
  if (appids.length === 0) {
    console.error('appid 를 하나도 못 찾았습니다. Steam search 응답을 확인하세요.');
    process.exit(1);
  }
  console.log(`  ${appids.length}개 appid 수집 완료\n`);

  // (2) 순차 처리
  let ok = 0;
  let fail = 0;
  let consecutiveSkips = 0;
  let consecutiveErrors = 0;
  const startedAt = Date.now();

  for (let i = 0; i < appids.length; i++) {
    const appid = appids[i];
    let result = await fetchAppDetails(appid);

    // Rate limit — 한 번 대기 후 재시도, 또 실패면 중단
    if (result.kind === 'rate-limit') {
      const wait = Math.min(result.retryAfterSec * 1000 * 2, 5 * 60 * 1000);
      console.warn(
        `[429] ${appid}: ${result.retryAfterSec}s 대기 (실제 ${Math.round(wait / 1000)}s) 후 재시도`,
      );
      await sleep(wait);
      result = await fetchAppDetails(appid);
      if (result.kind === 'rate-limit') {
        console.error(`[abort] ${appid}: 재시도 후에도 429. 중단.`);
        break;
      }
    }

    // 차단 — 즉시 중단
    if (result.kind === 'blocked') {
      console.error(`[abort] ${appid}: HTTP 403 — IP 차단 의심. 중단.`);
      break;
    }

    if (result.kind === 'ok') {
      // coming_soon 검증
      if (result.data.release_date?.coming_soon !== true) {
        console.log(
          `[skip] ${appid}: coming_soon=false (이미 출시) — ${result.data.name ?? ''}`,
        );
        consecutiveSkips++;
        consecutiveErrors = 0;
      } else {
        try {
          const r = await upsertUpcomingGame(appid, result.data);
          if (r) {
            console.log(`[ok]   ${appid}  ${result.data.name ?? '(no name)'}`);
            ok++;
            consecutiveSkips = 0;
            consecutiveErrors = 0;
          } else {
            fail++;
            consecutiveErrors++;
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error(`[err]  ${appid}: ${msg}`);
          fail++;
          consecutiveErrors++;
        }
      }
    } else if (result.kind === 'no-data') {
      console.warn(`[skip] ${appid}: appdetails 응답 없음`);
      consecutiveSkips++;
    } else if (result.kind === 'http-error') {
      console.warn(`[http ${result.status}] ${appid}`);
      consecutiveErrors++;
    } else if (result.kind === 'network') {
      console.warn(`[net]  ${appid}`);
      consecutiveErrors++;
    }

    // 안전장치 — 임계값 초과 시 중단
    if (consecutiveSkips >= MAX_CONSECUTIVE_SKIPS) {
      console.error(
        `[abort] 연속 스킵 ${consecutiveSkips}회 — IP 차단 의심. 중단.`,
      );
      break;
    }
    if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
      console.error(
        `[abort] 연속 에러 ${consecutiveErrors}회 — 네트워크/차단 의심. 중단.`,
      );
      break;
    }

    // 진행률 보고
    if ((i + 1) % 25 === 0 || i === appids.length - 1) {
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
      console.log(
        `  --- ${i + 1}/${appids.length}  ok=${ok} fail=${fail}  (${elapsed}s) ---`,
      );
    }

    // rate limit 회피 — 마지막 게임 뒤에는 굳이 대기 안 함
    if (i < appids.length - 1) await sleep(DELAY_MS);
  }

  const total = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`\n> 완료. ok=${ok} fail=${fail} (총 ${total}s)`);
}

// 최상위 await 회피용 IIFE
main().catch((e) => {
  console.error('치명적 오류:', e);
  process.exit(1);
});
