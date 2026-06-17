'use client';

import Image from 'next/image';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { usePickerGames } from '@/lib/hooks/usePickerGames';
import { seedTasteFromGames } from '@/lib/api/pickerApi';

/** 취향 시드에 필요한 최소 선택 수 */
const MIN_PICK = 3;

/**
 * 온보딩 게임 픽커 — 취향 신호가 없는 신규 유저에게 추천 선반 대신 노출.
 * "재밌게 했던 게임"을 고르면 그 게임들의 장르·태그로 취향을 시드해 추천이 작동한다.
 */
export function GamePicker({
  userId,
  onSkip,
}: {
  userId?: string;
  onSkip: () => void;
}) {
  const qc = useQueryClient();
  const { data: games = [], isLoading } = usePickerGames();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const count = selected.size;
  const canSubmit = count >= MIN_PICK && !submitting;

  async function handleConfirm() {
    if (!canSubmit || !userId) return;
    setSubmitting(true);
    try {
      await seedTasteFromGames([...selected]);
      // 시드 반영 → 취향 칩이 채워지면 상위(client)가 픽커를 추천 선반으로 전환한다.
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['taste-chips', userId] }),
        qc.invalidateQueries({ queryKey: ['recommend-cards', userId] }),
        qc.invalidateQueries({ queryKey: ['recent-save-recs', userId] }),
      ]);
      toast('취향을 반영했어요! 맞춤 추천을 만들었어요.');
    } catch (e) {
      console.error('seedTasteFromGames 실패:', e);
      toast('취향 저장에 실패했어요. 다시 시도해 주세요.');
      setSubmitting(false); // 실패 시에만 복구(성공 시엔 곧 언마운트)
    }
  }

  return (
    <section>
      <div className="mb-8">
        <h1 className="text-3xl tablet:text-4xl font-bold text-white">
          재밌게 했던 게임을 골라주세요
        </h1>
        <p className="mt-2 text-md text-gray-400">
          {MIN_PICK}개 이상 고르면 취향에 딱 맞는 추천을 만들어드려요.
        </p>
      </div>

      <div className="grid grid-cols-2 tablet:grid-cols-3 desktop:grid-cols-4 gap-4 tablet:gap-5">
        {isLoading
          ? Array.from({ length: 24 }).map((_, i) => (
              <div key={i} className="aspect-[460/215] rounded-xl overflow-hidden">
                <Skeleton className="h-full w-full" />
              </div>
            ))
          : games.map((game) => {
              const picked = selected.has(game.id);
              return (
                <button
                  key={game.id}
                  type="button"
                  aria-pressed={picked}
                  onClick={() => toggle(game.id)}
                  className={cn(
                    'group relative aspect-[460/215] rounded-xl overflow-hidden text-left',
                    'ring-2 transition-[ring,transform] focus:outline-none',
                    picked
                      ? 'ring-purple2'
                      : 'ring-transparent hover:ring-gray-600',
                  )}
                >
                  {game.image ? (
                    <Image
                      fill
                      sizes="(max-width: 767px) 50vw, (max-width: 1439px) 33vw, 25vw"
                      src={game.image}
                      alt={game.name}
                      className={cn(
                        'object-cover transition-opacity',
                        picked ? 'opacity-100' : 'opacity-70 group-hover:opacity-100',
                      )}
                    />
                  ) : (
                    <div className="h-full w-full bg-muted" />
                  )}

                  {/* 선택 체크 오버레이 */}
                  {picked && (
                    <span className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-purple2 text-white shadow">
                      <Check className="h-4 w-4" />
                    </span>
                  )}

                  {/* 제목 (하단 그라데이션) */}
                  <span className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2 pt-6">
                    <span className="line-clamp-1 text-sm font-semibold text-white">
                      {game.name}
                    </span>
                  </span>
                </button>
              );
            })}
      </div>

      {/* 하단 고정 액션 바 */}
      <div className="sticky bottom-0 mt-8 flex items-center justify-between gap-4 border-t border-gray-800 bg-gray-950/90 py-4 backdrop-blur">
        <button
          type="button"
          onClick={onSkip}
          disabled={submitting}
          className="text-sm text-gray-400 underline-offset-4 hover:text-gray-200 hover:underline disabled:opacity-50"
        >
          건너뛰기
        </button>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400">
            <span className={cn(count >= MIN_PICK && 'text-purple2 font-semibold')}>
              {count}
            </span>{' '}
            / 최소 {MIN_PICK}개
          </span>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={!canSubmit}
            className="bg-purple2 text-white hover:bg-purple2/90"
          >
            {submitting ? '만드는 중…' : '추천 받기'}
          </Button>
        </div>
      </div>
    </section>
  );
}
