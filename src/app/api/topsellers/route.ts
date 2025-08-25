import { NextResponse } from 'next/server';

export const revalidate = 60;

const STEAM_LANG = process.env.STEAM_LANG ?? 'koreana';
const STEAM_CC = process.env.STEAM_CC ?? 'kr';

type SearchResultsResponse = { results_html?: string };

function extractIdsFromSearchHtml(html: string): number[] {
  const re = /data-ds-appid="(\d+)"/g;
  const ids: number[] = [];
  for (const m of html.matchAll(re)) {
    const id = Number(m[1]);
    if (Number.isFinite(id)) ids.push(id);
  }
  return ids;
}

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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(
    Math.max(Number(searchParams.get('limit') ?? 30), 1),
    100,
  );
  const offset = Math.max(Number(searchParams.get('offset') ?? 0), 0);

  const ids = await fetchTopSellingAppIds(limit, offset);
  const nextOffset = ids.length === limit ? offset + limit : null;

  return NextResponse.json(
    { ids, limit, offset, nextOffset },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    },
  );
}
