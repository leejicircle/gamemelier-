'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { CardsGrid } from '@/app/shared/components/CardsGrid';
import GuestPage from '../shared/components/GuestPage';
import { SaleShelf } from './components/SaleShelf';
import { useRecommendCards } from '@/lib/hooks/useRecommendCards';
import { useSavedOnSale } from '@/lib/hooks/useSavedOnSale';
import { useDismissedIds } from '@/lib/hooks/useDismissedIds';
import { dismissGame, undoDismissGame } from '@/lib/api/feedbackApi';
import { logEvent, logEvents } from '@/lib/api/eventsApi';
import type { CardItem } from '@/types';

type Props = {
  ssrUserId?: string;
  ssrBudgetCents?: number;
  ssrLimit?: number;
  ssrExcludeUpcoming?: boolean;
  ssrNickname?: string;
};

/** 화면에 노출할 추천 카드 수. 여유분(ssrLimit)에서 '관심 없음'을 제외하고 잘라낸다. */
const VISIBLE_COUNT = 6;

/** 같은 마운트에서 같은 카드 노출(impression)을 중복 기록하지 않기 위한 훅. */
function useImpressionLog(items: { id: number }[], source: string) {
  const logged = useRef<Set<number>>(new Set());
  useEffect(() => {
    const fresh = items.filter((g) => !logged.current.has(g.id));
    if (fresh.length === 0) return;
    fresh.forEach((g) => logged.current.add(g.id));
    void logEvents(
      fresh.map((g) => ({
        game_id: g.id,
        event_type: 'impression' as const,
        source,
      })),
    );
  }, [items, source]);
}

export default function RecommendClient({
  ssrUserId,
  ssrBudgetCents,
  ssrLimit = 12,
  ssrExcludeUpcoming = true,
  ssrNickname,
}: Props) {
  const qc = useQueryClient();

  const {
    data = [],
    isLoading,
    isError,
    error,
  } = useRecommendCards(ssrUserId, ssrBudgetCents, ssrLimit, ssrExcludeUpcoming);
  const { data: dismissedSet } = useDismissedIds(ssrUserId);
  const { data: saleItems = [] } = useSavedOnSale(ssrUserId);

  // 서버 반영을 기다리지 않고 즉시 카드를 빼기 위한 낙관적 상태.
  // 실패하면 롤백한다.
  const [locallyDismissed, setLocallyDismissed] = useState<Set<number>>(
    new Set(),
  );

  // 선반 A — '관심 없음' 게임을 제외하고 6장 노출 (여유분이 빈자리를 채운다)
  const visible: CardItem[] = useMemo(() => {
    const filtered = data.filter(
      (g) => !locallyDismissed.has(g.id) && !dismissedSet?.has(g.id),
    );
    return filtered.slice(0, VISIBLE_COUNT);
  }, [data, dismissedSet, locallyDismissed]);

  useImpressionLog(visible, 'recommend_main');
  useImpressionLog(saleItems, 'wishlist_sale');

  if (!ssrUserId) {
    return <GuestPage />;
  }

  const rollbackDismiss = (gameId: number) =>
    setLocallyDismissed((prev) => {
      const next = new Set(prev);
      next.delete(gameId);
      return next;
    });

  async function handleDismiss(gameId: number) {
    // 1) 낙관적으로 즉시 카드 제거
    setLocallyDismissed((prev) => new Set(prev).add(gameId));
    try {
      // 2) 서버 반영
      await dismissGame(gameId);
      void logEvent({
        game_id: gameId,
        event_type: 'dismiss',
        source: 'recommend_main',
      });
      qc.invalidateQueries({ queryKey: ['dismissed-ids', ssrUserId] });
      toast('이 게임은 앞으로 덜 추천할게요.', {
        action: {
          label: '실행취소',
          onClick: () => {
            undoDismissGame(gameId)
              .then(() => {
                rollbackDismiss(gameId);
                qc.invalidateQueries({
                  queryKey: ['dismissed-ids', ssrUserId],
                });
              })
              .catch(() => toast('실행취소에 실패했어요.'));
          },
        },
      });
    } catch (e) {
      // 3) 실패 시 카드를 되돌린다. 보조 기능이라 요란한 에러는 띄우지 않는다.
      rollbackDismiss(gameId);
      console.error('dismissGame 실패:', e);
    }
  }

  return (
    <section className="container-fluid">
      <CardsGrid
        title={ssrNickname ? '님을 위한 추천 게임' : '개인 맞춤 추천'}
        nickname={ssrNickname}
        items={visible}
        isLoading={isLoading}
        onDismiss={handleDismiss}
        onItemClick={(gameId) =>
          void logEvent({
            game_id: gameId,
            event_type: 'card_click',
            source: 'recommend_main',
          })
        }
      />
      {isError && (
        <p className="text-sm text-red-400">
          에러: {(error as Error)?.message}
        </p>
      )}

      <SaleShelf items={saleItems} />
    </section>
  );
}
