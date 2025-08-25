'use client';

import { useEffect, useState } from 'react';
import { Heart, Loader2 } from 'lucide-react';
import { toggleSaved, fetchIsSaved } from '@/lib/api/savedGamesApi';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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
  const [isSaved, setIsSaved] = useState<boolean | null>(initialSaved ?? null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    if (isSaved == null) {
      fetchIsSaved(gameId)
        .then((r) => mounted && setIsSaved(r.is_saved))
        .catch(() => mounted && setIsSaved(false));
    }
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

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
    } catch {
      setIsSaved(isSaved ?? false);
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
