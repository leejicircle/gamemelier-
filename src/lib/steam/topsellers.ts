/**
 * Steam Store 의 "topsellers" 목록에서 appid 를 추출하는 **서버 전용** 로직.
 *
 * 서버(라우트 핸들러 / 서버 컴포넌트)에서 직접 호출한다. 클라이언트(브라우저)는
 * Steam search 엔드포인트에 CORS 로 직접 접근할 수 없으므로 `/api/topsellers`
 * 라우트를 거쳐야 한다 (src/lib/api/topSellers.ts 의 fetchTopSellerIds 참고).
 *
 * 과거에는 서버 컴포넌트도 자기 API 라우트를 HTTP 로 self-fetch 했는데, 이는
 * NEXT_BASE_URL 환경변수에 의존하고(없으면 상대경로→서버 fetch 'Invalid URL'),
 * 불필요한 네트워크 왕복을 유발했다. 이 모듈을 직접 호출해 그 문제를 제거한다.
 */

const STEAM_LANG = process.env.STEAM_LANG ?? 'koreana';
const STEAM_CC = process.env.STEAM_CC ?? 'kr';

type SearchResultsResponse = { results_html?: string };

/** Steam search 결과 HTML 에서 `data-ds-appid="..."` 패턴으로 appid 추출. */
function extractIdsFromSearchHtml(html: string): number[] {
  const re = /data-ds-appid="(\d+)"/g;
  const ids: number[] = [];
  for (const m of html.matchAll(re)) {
    const id = Number(m[1]);
    if (Number.isFinite(id)) ids.push(id);
  }
  return ids;
}

/** topsellers 필터로 페이지를 넘기며 중복 없는 appid 를 limit 개까지 수집. */
async function fetchTopSellingAppIds(
  limit: number,
  offset: number,
): Promise<number[]> {
  const out: number[] = [];
  const seen = new Set<number>();

  let start = offset;
  const pageSize = limit;
  let attempts = 0;
  const MAX_ATTEMPTS = 10;

  while (out.length < limit && attempts < MAX_ATTEMPTS) {
    const url =
      `https://store.steampowered.com/search/results/?start=${start}` +
      `&count=${pageSize}&filter=topsellers&category1=998&cc=${STEAM_CC}&l=${STEAM_LANG}&infinite=1`;

    const r = await fetch(url, { headers: { accept: 'application/json' } });
    if (!r.ok) break;

    const data = (await r.json().catch(() => ({}))) as SearchResultsResponse;
    const html = typeof data.results_html === 'string' ? data.results_html : '';
    if (!html) break;

    const ids = extractIdsFromSearchHtml(html);
    if (ids.length === 0) break;

    for (const id of ids) {
      if (!seen.has(id)) {
        seen.add(id);
        out.push(id);
        if (out.length >= limit) break;
      }
    }

    start += pageSize;
    attempts++;
  }

  return out.slice(0, limit);
}

/**
 * topseller appid 목록과 다음 페이지 offset 을 반환.
 * 라우트 핸들러(/api/topsellers)와 서버 컴포넌트(page.tsx)가 공통으로 사용한다.
 */
export async function getTopSellerIds(
  limit: number,
  offset: number,
): Promise<{ ids: number[]; nextOffset: number | null }> {
  const ids = await fetchTopSellingAppIds(limit, offset);
  const nextOffset = ids.length === limit ? offset + limit : null;
  return { ids, nextOffset };
}
