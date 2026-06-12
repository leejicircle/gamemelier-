'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { logEvent } from '@/lib/api/eventsApi';
import type { SaleItem } from '@/types';

function formatPrice(cents?: number | null) {
  if (cents == null) return '무료';
  return `₩${(cents / 100).toLocaleString('ko-KR')}`;
}

/**
 * 선반 C — "찜한 게임이 세일 중".
 * user_saved_games × game_prices(할인 중) 조합. 결과가 없으면 렌더하지 않는다.
 */
export function SaleShelf({ items }: { items: SaleItem[] }) {
  const router = useRouter();

  if (items.length === 0) return null;

  return (
    <section className="mt-16">
      <h2 className="text-2xl tablet:text-3xl font-bold text-white mb-6">
        찜한 게임이 세일 중
      </h2>
      <div className="flex flex-col gap-4">
        {items.map((game) => (
          <Card
            key={game.id}
            className="flex flex-row items-center gap-4 p-3 tablet:p-4 cursor-pointer"
            onClick={() => {
              void logEvent({
                game_id: game.id,
                event_type: 'card_click',
                source: 'wishlist_sale',
              });
              router.push(`/games/${game.id}`);
            }}
          >
            {game.image ? (
              <div className="relative w-[120px] tablet:w-[160px] aspect-[460/215] shrink-0">
                <Image
                  fill
                  sizes="(max-width: 767px) 120px, 160px"
                  src={game.image}
                  alt={game.name}
                  className="object-cover rounded-lg"
                />
              </div>
            ) : (
              <div className="w-[120px] tablet:w-[160px] aspect-[460/215] bg-muted rounded-lg shrink-0" />
            )}

            <div className="flex-1 min-w-0">
              <h3 className="line-clamp-2 text-md font-semibold text-gray-200">
                {game.name}
              </h3>
            </div>

            <div className="text-right shrink-0">
              <div className="text-md font-medium text-gray-600">
                <span className="mr-2 text-white">
                  -{game.discount_percent}%
                </span>
                <span className="line-through">
                  {formatPrice(game.initial_cents)}
                </span>
              </div>
              <div className="text-xl font-semibold text-white">
                {formatPrice(game.final_cents)}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}
