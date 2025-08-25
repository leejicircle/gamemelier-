import { createClient } from '@/lib/supabase/server';
import { PostgrestError } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

type SearchGamesRow = {
  id: number;
  name: string;
  image: string | null;
  score: number;
};

type SearchApiResponse = {
  items: SearchGamesRow[];
  meta?: { query: string; limit: number };
  error?: string;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get('query') ?? '').trim();
  const limitRaw = Number(url.searchParams.get('limit') ?? 8);
  const limit = Math.min(Number.isFinite(limitRaw) ? limitRaw : 8, 20);

  if (query.length < 1) {
    const body: SearchApiResponse = { items: [], meta: { query, limit } };
    return NextResponse.json(body);
  }

  const supabase = await createClient();

  const {
    data,
    error,
  }: { data: SearchGamesRow[] | null; error: PostgrestError | null } =
    await supabase.rpc('search_games', {
      q: query,
      p_limit: limit,
    });

  if (error) {
    const body: SearchApiResponse = {
      items: [],
      error: error.message,
      meta: { query, limit },
    };
    return NextResponse.json(body, { status: 500 });
  }

  const items: SearchGamesRow[] = (data ?? []).map((row) => ({
    id: Number(row.id),
    name: String(row.name),
    image: row.image ?? null,
    score: Number(row.score ?? 0),
  }));

  const body: SearchApiResponse = { items, meta: { query, limit } };
  return NextResponse.json(body, {
    headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=300' },
  });
}
