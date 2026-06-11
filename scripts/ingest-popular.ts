/**
 * =============================================================================
 * scripts/ingest-popular.ts
 * -----------------------------------------------------------------------------
 * 역할:
 *   Steam "topsellers"(인기/판매 상위) 목록에서 인기 출시작을 발견해, public.games
 *   에 "아직 없는 게임만" 신규 INSERT 한다 (카탈로그 확장용 발견 단계).
 *
 *   - ingest-upcoming.ts : "출시예정" 신규 유입
 *   - ingest-popular.ts  : "인기 출시작" 신규 유입  ← 이 파일
 *   - ingest-steam.ts    : 기존 게임 상세/가격 전체 갱신
 *
 * ⚠️ "lean insert" 정책:
 *   카드/목록 표시에 필요한 핵심만 넣는다 → games, covers, genres, prices, raw.
 *   스크린샷·동영상·시스템요구사항·카테고리·개발사/배급사·플랫폼 등 상세는
 *   다음 ingest-steam 실행이 채운다(매일 전체 갱신 시 모든 부속 테이블 기록).
 *   → 발견 직후 카드는 정상 표시되고, 24시간 내 상세까지 완성된다.
 *   (전체 부속 테이블을 즉시 채우고 싶으면 ingest-upcoming 의 upsert 로직 참고)
 *
 * 실행:
 *   npx tsx --env-file=.env.ingest scripts/ingest-popular.ts
 *
 * 환경변수:
 *   INGEST_SUPABASE_URL, INGEST_SERVICE_ROLE_KEY   (필수)
 *   INGEST_POPULAR_COUNT          (옵션) 발견할 topseller 수. 기본 400.
 *   INGEST_DELAY_MS               (옵션) appdetails 호출 간 지연. 기본 800ms.
 *   INGEST_MAX_CONSECUTIVE_ERRORS (옵션) 연속 에러 임계값. 기본 5.
 *
 * 안전장치: ingest-upcoming/steam 과 동일 (403 즉시 중단, 429 재시도, 연속에러 중단).
 * =============================================================================
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.INGEST_SUPABASE_URL;
const SERVICE_KEY = process.env.INGEST_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    '환경변수 누락: INGEST_SUPABASE_URL / INGEST_SERVICE_ROLE_KEY 를 설정하세요.',
  );
  process.exit(1);
}

const STEAM_LANG = 'koreana';
const STEAM_CC = 'kr';
const POPULAR_COUNT = Number(process.env.INGEST_POPULAR_COUNT ?? 400);
const DELAY_MS = Number(process.env.INGEST_DELAY_MS ?? 800);
const MAX_CONSECUTIVE_ERRORS = Number(
  process.env.INGEST_MAX_CONSECUTIVE_ERRORS ?? 5,
);

const sb: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type SteamAppData = {
  type?: string;
  name?: string;
  short_description?: string;
  header_image?: string;
  release_date?: { coming_soon?: boolean; date?: string };
  genres?: { id: string; description: string }[];
  metacritic?: { score?: number; url?: string };
  recommendations?: { total?: number };
  price_overview?: {
    currency: string;
    final?: number;
    initial?: number;
    discount_percent?: number;
  };
};
type SteamAppDetailsResponse = Record<
  string,
  { success: boolean; data?: SteamAppData }
>;
type SteamSearchResponse = { results_html?: string };

type FetchResult =
  | { kind: 'ok'; data: SteamAppData }
  | { kind: 'no-data' }
  | { kind: 'rate-limit'; retryAfterSec: number }
  | { kind: 'blocked' }
  | { kind: 'http-error'; status: number }
  | { kind: 'network' };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 한국어 출시일 텍스트 → ISO. 인기작은 보통 구체 날짜라 일/월 패턴만 처리. */
function parseKoreanDate(s: string | null | undefined): string | null {
  if (!s) return null;
  const full = s.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
  if (full) {
    return new Date(
      Date.UTC(+full[1], +full[2] - 1, +full[3] - 1, 15, 0, 0),
    ).toISOString();
  }
  const month = s.match(/(\d{4})년\s*(\d{1,2})월/);
  if (month) {
    return new Date(Date.UTC(+month[1], +month[2] - 1, 0, 15, 0, 0)).toISOString();
  }
  return null;
}

function extractIdsFromSearchHtml(html: string): number[] {
  const re = /data-ds-appid="(\d+)"/g;
  const ids: number[] = [];
  for (const m of html.matchAll(re)) {
    const id = Number(m[1]);
    if (Number.isFinite(id)) ids.push(id);
  }
  return ids;
}

/** topsellers 필터로 페이지를 넘기며 중복 없는 appid 를 count 개까지 수집. */
async function discoverPopularAppIds(count: number): Promise<number[]> {
  const collected: number[] = [];
  const seen = new Set<number>();
  let start = 0;
  const pageSize = Math.min(count, 100);
  let attempts = 0;
  const MAX_ATTEMPTS = 12;

  while (collected.length < count && attempts < MAX_ATTEMPTS) {
    const url =
      `https://store.steampowered.com/search/results/` +
      `?start=${start}&count=${pageSize}&filter=topsellers&category1=998` +
      `&cc=${STEAM_CC}&l=${STEAM_LANG}&infinite=1`;

    let res: Response;
    try {
      res = await fetch(url, { headers: { accept: 'application/json' } });
    } catch (e) {
      console.warn('[discover net-err]', (e as Error).message);
      break;
    }
    if (!res.ok) {
      console.warn(`[discover http ${res.status}] start=${start}`);
      break;
    }
    const data = (await res.json().catch(() => ({}))) as SteamSearchResponse;
    const html = typeof data.results_html === 'string' ? data.results_html : '';
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
    await sleep(500); // 검색 페이지 간 가벼운 지연
  }
  return collected.slice(0, count);
}

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
  if (res.status === 403) return { kind: 'blocked' };
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
 * 신규 인기 게임을 lean 하게 INSERT (카드 표시 핵심: games/covers/genres/prices/raw).
 * 상세 부속 테이블은 다음 ingest-steam 실행이 채운다.
 */
async function insertPopularGame(
  appid: number,
  data: SteamAppData,
): Promise<boolean> {
  const now = new Date().toISOString();
  const releaseText = data.release_date?.date ?? null;
  const firstReleaseDate = parseKoreanDate(releaseText);

  // (1) covers 먼저 — games.cover_id FK 가 covers.id 를 참조
  let coverId: number | null = null;
  if (data.header_image) {
    const { error } = await sb
      .from('covers')
      .upsert({ id: appid, url: data.header_image, updated_at: now }, {
        onConflict: 'id',
      });
    if (!error) coverId = appid;
  }

  // (2) games — UPSERT (신규 INSERT, 이미 있으면 갱신)
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
      cover_id: coverId,
      refreshed_at: now,
      updated_at: now,
    },
    { onConflict: 'id' },
  );
  if (gameErr) {
    console.warn(`[games upsert] ${appid}: ${gameErr.message}`);
    return false;
  }

  // (3) raw payload (디버깅/재처리용)
  await sb
    .from('game_raw_payloads')
    .upsert({ game_id: appid, raw: data }, { onConflict: 'game_id' });

  // (4) genres — 카드 카테고리 표시용
  if (Array.isArray(data.genres)) {
    const genreIds: number[] = [];
    for (const g of data.genres) {
      const id = parseInt(g.id, 10);
      if (!Number.isFinite(id)) continue;
      await sb.from('genres').upsert({ id, name: g.description }, {
        onConflict: 'id',
      });
      genreIds.push(id);
    }
    await sb.from('game_genres').delete().eq('game_id', appid);
    if (genreIds.length > 0) {
      await sb
        .from('game_genres')
        .insert(genreIds.map((genre_id) => ({ game_id: appid, genre_id })));
    }
  }

  // (5) prices — 카드/목록 가격 표시용
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

  return true;
}

async function main() {
  console.log('> 인기 출시작 ingest 시작');
  console.log(`  count: ${POPULAR_COUNT} / delay: ${DELAY_MS}ms\n`);

  // 기존 게임 ID 적재 → 이미 있으면 발견해도 스킵(신규만 appdetails 호출)
  const { data: existingRows, error: exErr } = await sb
    .from('games')
    .select('id');
  if (exErr) {
    console.error('games 조회 실패:', exErr.message);
    process.exit(1);
  }
  const existing = new Set<number>(
    (existingRows ?? []).map((r) => r.id as number),
  );
  console.log(`  기존 게임 ${existing.size}개 (이들은 스킵)`);

  console.log('> Steam topsellers 에서 appid 수집 중...');
  const appids = await discoverPopularAppIds(POPULAR_COUNT);
  if (appids.length === 0) {
    console.error('appid 를 하나도 못 찾았습니다. Steam search 응답을 확인하세요.');
    process.exit(1);
  }
  const fresh = appids.filter((id) => !existing.has(id));
  console.log(`  발견 ${appids.length}개 중 신규 ${fresh.length}개 처리\n`);

  let ok = 0;
  let fail = 0;
  let consecutiveErrors = 0;
  const startedAt = Date.now();

  for (let i = 0; i < fresh.length; i++) {
    const appid = fresh[i];
    let result = await fetchAppDetails(appid);

    if (result.kind === 'rate-limit') {
      const wait = Math.min(result.retryAfterSec * 2 * 1000, 5 * 60 * 1000);
      console.warn(`[429] ${appid}: ${Math.round(wait / 1000)}s 대기 후 재시도`);
      await sleep(wait);
      result = await fetchAppDetails(appid);
      if (result.kind === 'rate-limit') {
        console.error(`[abort] ${appid}: 재시도 후에도 429. 중단.`);
        break;
      }
    }
    if (result.kind === 'blocked') {
      console.error(`[abort] ${appid}: HTTP 403 — IP 차단 의심. 중단.`);
      break;
    }

    if (result.kind === 'ok') {
      // 'game' 타입만 적재 (topsellers 에 섞일 수 있는 DLC/소프트웨어/영상 제외)
      if (result.data.type && result.data.type !== 'game') {
        console.log(`[skip] ${appid}: type=${result.data.type}`);
      } else {
        try {
          const r = await insertPopularGame(appid, result.data);
          if (r) {
            console.log(`[ok]   ${appid}  ${result.data.name ?? '(no name)'}`);
            ok++;
            consecutiveErrors = 0;
          } else {
            fail++;
            consecutiveErrors++;
          }
        } catch (e) {
          console.error(
            `[err]  ${appid}: ${e instanceof Error ? e.message : String(e)}`,
          );
          fail++;
          consecutiveErrors++;
        }
      }
    } else if (result.kind === 'no-data') {
      console.warn(`[skip] ${appid}: appdetails 응답 없음`);
    } else {
      console.warn(`[${result.kind}] ${appid}`);
      consecutiveErrors++;
    }

    if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
      console.error(`[abort] 연속 에러 ${consecutiveErrors}회 — 중단.`);
      break;
    }
    if ((i + 1) % 25 === 0 || i === fresh.length - 1) {
      const el = ((Date.now() - startedAt) / 1000).toFixed(1);
      console.log(`  --- ${i + 1}/${fresh.length}  ok=${ok} fail=${fail}  (${el}s) ---`);
    }
    if (i < fresh.length - 1) await sleep(DELAY_MS);
  }

  console.log(`\n> 완료. 신규 ${ok}건 추가, fail=${fail}`);
}

main().catch((e) => {
  console.error('치명적 오류:', e);
  process.exit(1);
});
