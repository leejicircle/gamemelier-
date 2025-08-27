'use client';

import Image from 'next/image';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { CardItem } from '@/types/games';
import SaveToggleButton from './saveToggleButton';
import { useRouter } from 'next/navigation';

interface CardsGridProps {
  items: CardItem[];
  title?: string;
  isLoading?: boolean;
  savedSet?: Set<number>;
  onSavedChange?: (gameId: number, saved: boolean) => void;
  startIndex?: number;
  endIndex?: number;
  totalCount?: number;
  nickname?: string;
}

export function CardsGrid({
  items,
  title,
  isLoading,
  savedSet,
  onSavedChange,
  totalCount = 0,
  nickname,
}: CardsGridProps) {
  const showSkeleton = isLoading ?? items.length === 0;
  const skeletonCount = showSkeleton ? 8 : items.length;
  const router = useRouter();
  console.log('items', items.length);

  return (
    <section>
      {title && (
        <div className="flex items-center mb-10 gap-3">
          <h1 className="flex items-baseline">
            {nickname && (
              <span className="text-purple2 text-4xl font-bold">
                {nickname}
              </span>
            )}
            <span className="text-white text-4xl font-bold">{title}</span>
          </h1>
          {typeof totalCount === 'number' && totalCount > 0 && (
            <p className="text-md font-semibold text-gray-500">
              총 {totalCount}
            </p>
          )}
        </div>
      )}

      <div className="w-full grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-20">
        {showSkeleton
          ? Array.from({ length: skeletonCount }).map((_, idx) => (
              <Card key={idx} className="flex gap-2">
                <div className="relative gradient-border-wrap w-[380px] h-[205px]">
                  <div className="gradient-border-content w-full h-full rounded-xl overflow-hidden">
                    <Skeleton className="absolute inset-0 h-full w-full" />
                  </div>
                  <div className="absolute right-4 bottom-4 z-10">
                    <Skeleton className="h-8 w-8 rounded-full" />
                  </div>
                </div>
                <CardContent className="bg-transparent flex-1">
                  <Skeleton className="h-5 w-3/4 mb-2" />
                </CardContent>
              </Card>
            ))
          : items.map((game, i) => (
              <Card
                key={game.id}
                className="flex gap-2"
                onClick={() => router.push(`/games/${game.id}`)}
              >
                {game.image ? (
                  <div className="relative gradient-border-wrap w-[380px] h-[205px] p-1 cursor-pointer">
                    <div className="gradient-border-content w-full h-full">
                      <Image
                        fill
                        sizes="(max-width: 768px) 100vw, (max-width: 1440px) 50vw, 33vw"
                        src={game.image}
                        alt={game.name}
                        priority={i === 0}
                        className=" object-cover rounded-xl"
                      />
                    </div>
                    <div className="absolute right-4 bottom-4 z-10">
                      <SaveToggleButton
                        gameId={game.id}
                        initialSaved={savedSet?.has(game.id)}
                        onChange={(saved) => onSavedChange?.(game.id, saved)}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="w-full h-[215px] bg-muted" />
                )}

                <CardContent className="bg-transparent">
                  <h3 className="line-clamp-2 text-md font-semibold text-gray-500">
                    {game.name}
                  </h3>
                  {game.category && (
                    <div className="mt-1 text-m font-semibold text-foreground">
                      {game.category}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
      </div>
    </section>
  );
}
