'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Heart, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { toggleSaved } from '@/lib/api/savedGamesApi';
import { logEvent } from '@/lib/api/eventsApi';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/useAuthStore';
import { useSavedGameIds } from '@/lib/hooks/useSavedGameIds';

type Props = {
  className?: string;
  gameId: number;
  initialSaved?: boolean;
  onChange?: (saved: boolean) => void;
};

export default function SaveToggleButton({
  className,
  gameId,
  initialSaved,

  onChange,
}: Props) {
  const userId = useAuthStore((s) => s.user?.id);
  const qc = useQueryClient();
  // 상위 savedSet(initialSaved)이 없으면 유저의 저장 id 집합을 공유 쿼리로 조회.
  // 모든 카드가 같은 queryKey 를 dedupe → 카드 수만큼 개별 조회하던 N+1 을 페이지당 1건으로.
  const { data: savedIds } = useSavedGameIds(initialSaved == null);
  const [isSaved, setIsSaved] = useState<boolean | null>(initialSaved ?? null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // 상위에서 savedSet 으로 초기값을 받은 경우는 그 값을 신뢰하고 재조회하지 않는다.
    if (initialSaved != null) return;
    // 비로그인: 조회 건너뛰고 미저장으로 둔다(공유 쿼리도 enabled=false).
    if (!userId) {
      setIsSaved(false);
      return;
    }
    // 공유 집합이 로드되면 그 값으로 저장 여부 반영.
    if (savedIds) setIsSaved(savedIds.has(gameId));
  }, [gameId, userId, initialSaved, savedIds]);

  async function onClick(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    if (loading) return;

    setLoading(true);
    try {
      const next = !(isSaved ?? false);
      setIsSaved(next);

      const { saved } = await toggleSaved(gameId);
      setIsSaved(saved);
      onChange?.(saved);
      // 공유 집합 캐시 동기화 → 리페치 없이 다른 카드/뷰의 저장 표시 일관성 유지.
      qc.setQueryData<Set<number>>(['saved-game-ids', userId], (prev) => {
        const next = new Set(prev ?? []);
        if (saved) next.add(gameId);
        else next.delete(gameId);
        return next;
      });
      void logEvent({
        game_id: gameId,
        event_type: saved ? 'save' : 'unsave',
      });
    } catch (e) {
      setIsSaved(isSaved ?? false);
      toast.error(
        e instanceof Error ? e.message : '저장 처리 중 오류가 발생했습니다.',
      );
    } finally {
      setLoading(false);
    }
  }

  const active = isSaved === true;
  return (
    <Button
      type="button"
      onClick={onClick}
      disabled={loading || isSaved == null}
      aria-pressed={active}
      aria-label={active ? '저장 해제' : '저장'}
      variant="gray"
      size="icon"
      className={cn(
        'rounded-full bg-gray-900 disabled:opacity-60',
        active && 'bg-white',
        className,
      )}
    >
      {loading ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : (
        <Heart
          className="h-5 w-5"
          fill={active ? 'var(--purple2)' : 'transparent'}
          stroke={active ? 'var(--purple2)' : 'currentColor'}
          strokeWidth={3}
        />
      )}
      <span className="sr-only">{active ? '저장 해제' : '저장'}</span>
    </Button>
  );
}
