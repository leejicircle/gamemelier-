'use client';
import { useQuery } from '@tanstack/react-query';
import { fetchSavedGameIds } from '@/lib/api/savedGamesApi';
import { useAuthStore } from '@/store/useAuthStore';

/**
 * 로그인 유저가 저장한 game_id 집합(공유 쿼리).
 * 모든 SaveToggleButton 이 동일 queryKey 로 이 훅을 쓰면 react-query 가 dedupe →
 * 카드가 아무리 많아도 user_saved_games 조회는 페이지당 1건(기존 카드별 N+1 제거).
 * @param enabled 상위에서 savedSet(initialSaved)을 이미 주는 경우 false 로 조회를 건너뛴다.
 */
export function useSavedGameIds(enabled = true) {
  const userId = useAuthStore((s) => s.user?.id);
  return useQuery({
    queryKey: ['saved-game-ids', userId],
    enabled: enabled && !!userId,
    queryFn: async () => new Set(await fetchSavedGameIds()),
    staleTime: 60_000,
  });
}
