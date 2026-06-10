import { NextResponse } from 'next/server';
import { getTopSellerIds } from '@/lib/steam/topsellers';

export const revalidate = 60;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(
    Math.max(Number(searchParams.get('limit') ?? 30), 1),
    100,
  );
  const offset = Math.max(Number(searchParams.get('offset') ?? 0), 0);

  // 핵심 로직은 서버 전용 공유 모듈에 있다. 이 라우트는 클라이언트가
  // (CORS 때문에) Steam 에 직접 접근하지 못하므로 두는 프록시 역할이다.
  const { ids, nextOffset } = await getTopSellerIds(limit, offset);

  return NextResponse.json(
    { ids, limit, offset, nextOffset },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    },
  );
}
