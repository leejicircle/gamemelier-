/**
 * =============================================================================
 * scripts/ingest-steam.ts
 * -----------------------------------------------------------------------------
 * 역할:
 *   현재 public.games 테이블에 있는 모든 게임 ID(Steam appid)에 대해
 *   Steam Store API의 appdetails 엔드포인트를 호출하여, 최신 메타데이터로
 *   다음 테이블들을 갱신한다:
 *
 *     - games                (이름/요약/이미지/출시일/메타크리틱/리뷰수/refreshed_at)
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
 *
 * 실행:
 *   npx tsx --env-file=.env.ingest scripts/ingest-steam.ts
 *
 *   환경변수 설정은 .env.ingest 참조 ( .env.ingest.example 템플릿 제공 ).
 *
 * 안전장치:
 *   - service_role 키 사용 → RLS 우회. 클라/공개 환경에 절대 노출 금지.
 *   - Steam API rate limit 회피를 위해 호출 간 지연(기본 350ms) 적용.
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
 * 실패하거나 success=false 인 경우 null 반환 (게임 삭제/지역 제한 등).
 */
async function fetchAppDetails(appid: number): Promise<SteamAppData | null> {
  const url =
    `https://store.steampowered.com/api/appdetails` +
    `?appids=${appid}&l=${STEAM_LANG}&cc=${STEAM_CC}`;

  let res: Response;
  try {
    res = await fetch(url, { headers: { accept: 'application/json' } });
  } catch (e) {
    console.warn(`[net-err] ${appid}: ${(e as Error).message}`);
    return null;
  }

  if (!res.ok) {
    console.warn(`[http ${res.status}] ${appid}`);
    return null;
  }

  const json = (await res.json().catch(() => null)) as
    | SteamAppDetailsResponse
    | null;
  if (!json) return null;

  const entry = json[String(appid)];
  if (!entry || !entry.success || !entry.data) return null;
  return entry.data;
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

// -----------------------------------------------------------------------------
// 게임 1건 처리 — 모든 관련 테이블 갱신
// -----------------------------------------------------------------------------

/**
 * 단일 게임에 대한 전체 ingest 파이프라인.
 * Steam 호출 → games UPDATE → 부속 테이블 UPSERT/REPLACE 순으로 진행.
 *
 * 반환값: true = 갱신 성공, false = 스킵(no data) 또는 부분 실패
 */
async function ingestGame(appid: number): Promise<boolean> {
  const data = await fetchAppDetails(appid);
  if (!data) {
    console.warn(`[skip] ${appid}: appdetails 응답 없음`);
    return false;
  }

  const now = new Date().toISOString();
  const releaseText = data.release_date?.date ?? null;
  const firstReleaseDate = parseKoreanDate(releaseText);

  // (1) games — UPDATE (id 는 이미 존재함을 전제, INSERT 안 함)
  const { error: gameErr } = await sb
    .from('games')
    .update({
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
    })
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

  console.log(`[ok]   ${appid}  ${data.name ?? '(no name)'}`);
  return true;
}

// -----------------------------------------------------------------------------
// 메인 — 게임 목록 조회 후 순차 처리
// -----------------------------------------------------------------------------

async function main() {
  console.log(`> Steam ingest 시작`);
  console.log(`  delay: ${DELAY_MS}ms / limit: ${LIMIT ?? '전체'} / skipFresh: ${SKIP_FRESH_HOURS}h`);

  // 처리 대상 게임 ID 조회.
  // SKIP_FRESH_HOURS 가 설정되어 있으면 최근 갱신된 게임은 제외.
  let query = sb.from('games').select('id, refreshed_at').order('id');
  const { data: rows, error } = await query;
  if (error) {
    console.error('games 조회 실패:', error.message);
    process.exit(1);
  }
  if (!rows || rows.length === 0) {
    console.error('games 테이블이 비어있음.');
    process.exit(1);
  }

  // refreshed_at 기준 필터링
  const cutoff =
    SKIP_FRESH_HOURS > 0
      ? Date.now() - SKIP_FRESH_HOURS * 3600 * 1000
      : null;

  const filtered = rows.filter((r) => {
    if (!cutoff) return true;
    if (!r.refreshed_at) return true;
    return new Date(r.refreshed_at as string).getTime() < cutoff;
  });

  // LIMIT 적용
  const target = LIMIT ? filtered.slice(0, LIMIT) : filtered;
  console.log(`  대상 ${target.length}건 (전체 ${rows.length}, 신선 스킵 ${rows.length - filtered.length})\n`);

  // 진행
  let ok = 0;
  let fail = 0;
  const startedAt = Date.now();

  for (let i = 0; i < target.length; i++) {
    const appid = target[i].id as number;
    try {
      const r = await ingestGame(appid);
      if (r) ok++;
      else fail++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[err]  ${appid}: ${msg}`);
      fail++;
    }

    // 25건마다 진행률 보고
    if ((i + 1) % 25 === 0 || i === target.length - 1) {
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
      console.log(
        `  --- ${i + 1}/${target.length}  ok=${ok} fail=${fail}  (${elapsed}s) ---`,
      );
    }

    // rate limit 회피
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
