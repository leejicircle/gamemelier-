'use client';

import Image from 'next/image';
import { ThumbsDown } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { CardItem, ReasonKind } from '@/types/games';
import SaveToggleButton from './saveToggleButton';
import { useRouter } from 'next/navigation';

/** 추천 이유 배지 색상 — 취향(보라) / 할인(로즈) / 평판(에메랄드) / 최신작(스카이) */
const REASON_STYLES: Record<ReasonKind, string> = {
  genre: 'border-purple2/40 text-purple2 bg-purple2/10',
  tag: 'border-purple2/40 text-purple2 bg-purple2/10',
  discount: 'border-rose-400/40 text-rose-300 bg-rose-500/10',
  quality: 'border-emerald-400/40 text-emerald-300 bg-emerald-500/10',
  recency: 'border-sky-400/40 text-sky-300 bg-sky-500/10',
};

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
  /** 카드 클릭(상세 이동) 직전 호출 — 클릭 로깅용 */
  onItemClick?: (gameId: number) => void;
  /** 전달 시 카드에 ✕(관심 없음) 버튼 노출 — 추천 탭 전용 */
  onDismiss?: (gameId: number) => void;
}

export function CardsGrid({
  items,
  title,
  isLoading,
  savedSet,
  onSavedChange,
  totalCount = 0,
  nickname,
  onItemClick,
  onDismiss,
}: CardsGridProps) {
  const showSkeleton = isLoading ?? items.length === 0;
  const skeletonCount = showSkeleton ? 8 : items.length;
  const router = useRouter();

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

      <div className="w-full grid grid-cols-1 tablet:grid-cols-2 desktop:grid-cols-3 gap-x-5 gap-y-10 tablet:gap-y-20">
        {showSkeleton
          ? Array.from({ length: skeletonCount }).map((_, idx) => (
              <Card key={idx} className="flex flex-col gap-2">
                <div className="relative gradient-border-wrap w-full aspect-[460/215]">
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
                className="flex flex-col gap-2"
                onClick={() => {
                  onItemClick?.(game.id);
                  router.push(`/games/${game.id}`);
                }}
              >
                {game.image ? (
                  <div className="relative gradient-border-wrap w-full aspect-[460/215] p-1 cursor-pointer">
                    <div className="gradient-border-content w-full h-full">
                      <Image
                        fill
                        sizes="(max-width: 767px) 100vw, (max-width: 1439px) 50vw, 33vw"
                        src={game.image}
                        alt={game.name}
                        priority={i === 0}
                        className=" object-cover rounded-xl"
                      />
                    </div>
                    {onDismiss && (
                      <div className="absolute right-16 bottom-4 z-10">
                        <Button
                          type="button"
                          variant="gray"
                          size="icon"
                          aria-label="관심 없음"
                          className="rounded-full bg-gray-900"
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            onDismiss(game.id);
                          }}
                        >
                          <ThumbsDown className="h-5 w-5" />
                          <span className="sr-only">관심 없음</span>
                        </Button>
                      </div>
                    )}
                    <div className="absolute right-4 bottom-4 z-10">
                      <SaveToggleButton
                        gameId={game.id}
                        initialSaved={savedSet?.has(game.id)}
                        onChange={(saved) => onSavedChange?.(game.id, saved)}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="w-full aspect-[460/215] bg-muted rounded-xl" />
                )}

                <CardContent className="bg-transparent">
                  {game.reason && (
                    <Badge
                      variant="outline"
                      className={cn(
                        'mb-2 font-medium',
                        game.reason_kind
                          ? REASON_STYLES[game.reason_kind]
                          : 'border-gray-700 text-gray-400',
                      )}
                    >
                      {game.reason}
                    </Badge>
                  )}
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
