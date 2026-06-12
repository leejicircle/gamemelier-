'use client';
import { useQuery } from '@tanstack/react-query';
import { fetchDismissedIds } from '@/lib/api/feedbackApi';

/**
 * '관심 없음' 표시한 게임 id Set — 추천 목록 클라이언트 필터용.
 * (v2 에서 recommend RPC 가 서버에서 제외하면 이 훅은 얇아진다.)
 * 테이블 미배포/에러 시 빈 Set — 추천이 그대로 노출되도록 한다.
 */
export function useDismissedIds(userId?: string) {
  return useQuery({
    queryKey: ['dismissed-ids', userId],
    enabled: !!userId,
    queryFn: async (): Promise<number[]> => {
      try {
        return await fetchDismissedIds();
      } catch {
        return [];
      }
    },
    select: (ids) => new Set(ids),
    staleTime: 60_000,
  });
}
