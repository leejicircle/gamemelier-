const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function fetchTopSellerIds(limit = 30, offset = 0) {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_BASE_URL ?? ''}/api/topsellers?limit=${limit}&offset=${offset}`,
    { cache: 'no-store' },
  );
  if (!res.ok) throw new Error('Top sellers 앱 ID 목록 요청 실패');
  return res.json() as Promise<{ ids: number[]; nextOffset: number | null }>;
}

export async function fetchCardsByOrderedIdsServer(appIds: number[]) {
  if (!appIds?.length) return [];
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/rpc/get_games_cards_by_ids`,
    {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_ids: appIds }),
    },
  );
  if (!res.ok) throw new Error(await res.text());

  const rows = (await res.json()) as {
    id: number;
    name: string;
    image: string | null;
    category: string | null;
  }[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    image: r.image,
    category: r.category ?? '기타',
  }));
}
