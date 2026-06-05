import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function proxy(request: NextRequest) {
  // Supabase 세션을 갱신하고 쿠키가 포함된 응답을 반환한다.
  // 로그인이 필요한 페이지(mypage, recommend 등)는 각 페이지에서
  // GuestPage 를 노출하는 방식으로 처리하므로, 여기서는 라우트 차단을 하지 않는다.
  const { response } = await updateSession(request);
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
