'use client';

import { CardsGrid } from '@/app/shared/components/CardsGrid';
import { logEvent } from '@/lib/api/eventsApi';
import type { RecentSaveRec } from '@/types';

/**
 * 선반 B — "'X'를 저장하셔서". 가장 최근 저장 게임 기준 유사작(아이템 유사도).
 * 데이터는 상위(client)에서 받아 노출 로깅까지 끝낸 뒤 전달된다. 비면 숨김.
 */
export function RecentSaveShelf({ items }: { items: RecentSaveRec[] }) {
  if (items.length === 0) return null;

  const anchorName = items[0].anchor_name;

  return (
    <section className="mt-16">
      <h2 className="mb-6 text-2xl tablet:text-3xl font-bold text-white">
        &lsquo;{anchorName}&rsquo;을(를) 저장하셔서
      </h2>
      <CardsGrid
        items={items}
        onItemClick={(id) =>
          void logEvent({
            game_id: id,
            event_type: 'card_click',
            source: 'recent_save',
          })
        }
      />
    </section>
  );
}
