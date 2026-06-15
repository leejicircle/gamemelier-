'use client';

import { useEffect, useState } from 'react';
import { Heart, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { toggleSaved, fetchIsSaved } from '@/lib/api/savedGamesApi';
import { logEvent } from '@/lib/api/eventsApi';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/useAuthStore';

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
  const [isSaved, setIsSaved] = useState<boolean | null>(initialSaved ?? null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // 상위에서 savedSet 으로 초기값을 받은 경우는 그 값을 신뢰하고 재조회하지 않는다.
    if (initialSaved != null) return;

    let mounted = true;

    (async () => {
      // 비로그인: 세션이 없으면 찜 여부 조회를 건너뛰고 미저장으로 둔다.
      // (게스트마다 카드 수만큼 인증 실패 RPC + 콘솔 에러가 쏟아지던 문제 방지)
      if (!userId) {
        if (mounted) setIsSaved(false);
        return;
      }
      try {
        const r = await fetchIsSaved(gameId);
        if (mounted) setIsSaved(r.is_saved);
      } catch (e) {
        if (mounted) setIsSaved(false);
        console.error('fetchIsSaved 실패:', e);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [gameId, userId, initialSaved]);

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
