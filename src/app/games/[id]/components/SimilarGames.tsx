'use client';

import { CardsGrid } from '@/app/shared/components/CardsGrid';
import { useSimilarGames } from '@/lib/hooks/useSimilarGames';
import { logEvent } from '@/lib/api/eventsApi';

/**
 * "이 게임과 비슷한 게임" — 장르 겹침(자카드) 기반. 비로그인 포함 전원 노출.
 * 데이터가 없거나 RPC 미배포면 섹션 자체를 렌더하지 않는다.
 */
export function SimilarGames({ gameId }: { gameId: number }) {
  const { data = [], isLoading } = useSimilarGames(gameId);

  if (!isLoading && data.length === 0) return null;

  return (
    <section className="mt-16">
      <h2 className="text-3xl font-bold text-white mb-6">
        이 게임과 비슷한 게임
      </h2>
      <CardsGrid
        items={data}
        isLoading={isLoading}
        onItemClick={(id) =>
          void logEvent({
            game_id: id,
            event_type: 'card_click',
            source: 'related',
          })
        }
      />
    </section>
  );
}
