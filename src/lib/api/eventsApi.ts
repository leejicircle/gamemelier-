import { supabase } from '@/lib/supabase/client';

export type UserEventType =
  | 'impression'
  | 'card_click'
  | 'detail_view'
  | 'save'
  | 'unsave'
  | 'dismiss'
  | 'search_click'
  | 'dwell';

export type UserEventInput = {
  game_id?: number;
  event_type: UserEventType;
  source?: string;
  value?: number;
};

/**
 * 행동 이벤트 적재 (fire-and-forget).
 * - 추천 품질 측정(CTR·저장율)과 이후 협업 필터링의 재료가 된다.
 * - UX 에 영향을 주면 안 되므로: 비로그인이면 no-op, 실패는 조용히 무시.
 * - RLS(auth.uid() = user_id)가 본인 행만 insert 되도록 보장.
 */
export async function logEvents(events: UserEventInput[]): Promise<void> {
  try {
    if (events.length === 0) return;
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) return;

    await supabase
      .from('user_events')
      .insert(events.map((e) => ({ ...e, user_id: userId })));
  } catch {
    // 로깅 실패는 기능에 영향 없음 — 무시
  }
}

export function logEvent(event: UserEventInput): Promise<void> {
  return logEvents([event]);
}
