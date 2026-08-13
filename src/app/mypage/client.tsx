'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Crown } from 'lucide-react';
import { fetchSavedList, type SavedGameItem } from '@/lib/api/savedGamesApi';
import { CardsGrid } from '@/app/shared/components/CardsGrid';
import type { CardItem } from '@/types/games';
import GenreModal from './components/GenreModal';

export default function MyPageClient({ userId }: { userId: string }) {
  const [items, setItems] = useState<SavedGameItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { items: first } = await fetchSavedList();
        if (cancelled) return;
        setItems(first);
      } catch (error) {
        console.error('error', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const cardItems: CardItem[] = useMemo(
    () =>
      items.map((s) => ({
        id: s.id,
        name: s.name,
        image: s.cover_url ?? '',
      })),
    [items],
  );

  const savedSet = useMemo(() => new Set(items.map((s) => s.id)), [items]);

  function handleSavedChange(gameId: number, saved: boolean) {
    if (!saved) {
      setItems((prev) => prev.filter((x) => x.id !== gameId));
    }
  }

  return (
    <div className="container-fluid space-y-4">
      <Link
        href={`/taste/${userId}`}
        className="border-purple2/40 bg-purple2/10 hover:bg-purple2/20 flex items-center gap-2 rounded-lg border px-4 py-3 text-sm text-white transition-colors"
      >
        <Crown size={16} className="text-purple2" />내 취향 카드 보기
      </Link>
      <CardsGrid
        title="저장한 게임"
        items={cardItems}
        isLoading={loading}
        savedSet={savedSet}
        onSavedChange={handleSavedChange}
      />
      {!loading && cardItems.length === 0 && (
        <div className="px-4 text-sm text-muted-foreground">
          저장한 게임이 없습니다.
        </div>
      )}
      <GenreModal />
    </div>
  );
}
