'use client';

import Image from 'next/image';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from '@/components/ui/carousel';
import type { EmblaOptionsType } from 'embla-carousel';
import { useEffect, useState } from 'react';
import SaveToggleButton from './saveToggleButton';
import { CardItem } from '@/types/games';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';

interface CarouselProps {
  items: CardItem[];
  title?: string;
  isLoading?: boolean;
  savedSet?: Set<number>;
  onSavedChange?: (gameId: number, saved: boolean) => void;
  emblaOptions?: EmblaOptionsType;
}

export function CardsCarousel({
  items,
  title,
  isLoading,
  savedSet,
  onSavedChange,
  emblaOptions = { loop: false, align: 'start', containScroll: 'trimSnaps' },
}: CarouselProps) {
  const [api, setApi] = useState<CarouselApi | null>(null);
  const [edge, setEdge] = useState<'left' | 'right' | 'none'>('left');
  const router = useRouter();

  const showSkeleton = isLoading ?? items.length === 0;
  const skeletonCount = showSkeleton ? 8 : items.length;

  useEffect(() => {
    if (!api) return;

    const updateEdge = () => {
      const atStart = !api.canScrollPrev() && api.canScrollNext();
      const atEnd = api.canScrollPrev() && !api.canScrollNext();
      if (atStart) setEdge('left');
      else if (atEnd) setEdge('right');
      else setEdge('none');
    };

    api.on('select', updateEdge);
    api.on('reInit', updateEdge);
    updateEdge();

    return () => {
      api.off('select', updateEdge);
      api.off('reInit', updateEdge);
    };
  }, [api, items.length]);

  return (
    <div className="mt-8">
      <div className=" ml-[120px] mb-3 flex items-center justify-between px-1">
        {title ? (
          <h1 className="text-3xl font-bold text-white">{title}</h1>
        ) : (
          <div />
        )}
      </div>

      <div
        className={cn(
          'transition-[padding] duration-200',
          edge === 'left' && 'ml-[120px] pr-0',
          edge === 'right' && 'pl-0 mr-[120px]',
          edge === 'none' && 'ml-[120px] pr-0',
        )}
      >
        <Carousel opts={emblaOptions} setApi={setApi} className="w-full">
          <CarouselContent>
            {showSkeleton
              ? Array.from({ length: skeletonCount }).map((_, i) => (
                  <CarouselItem key={i} className="basis-auto">
                    <Card className="flex gap-2 w-[460px]">
                      <div className="relative w-[460px]">
                        <div className="relative w-[460px] h-[215px] gradient-border-wrap p-1">
                          <div className="gradient-border-content w-full h-full rounded-xl overflow-hidden">
                            <Skeleton className="absolute inset-0 h-full w-full" />
                          </div>
                        </div>
                        <div className="absolute right-4 bottom-4 z-10">
                          <Skeleton className="h-9 w-9 rounded-full" />
                        </div>
                      </div>

                      <CardContent className="bg-transparent pt-2 flex-1">
                        <Skeleton className="h-5 w-3/4 mb-2" />
                        <Skeleton className="h-4 w-1/3" />
                      </CardContent>
                    </Card>
                  </CarouselItem>
                ))
              : items.map((game, i) => (
                  <CarouselItem key={game.id} className="basis-auto">
                    <Card
                      className="flex gap-2 w-[460px]"
                      onClick={() => router.push(`/games/${game.id}`)}
                    >
                      {game.image ? (
                        <div className="relative w-[460px]">
                          <div className="relative w-[460px] h-[215px] gradient-border-wrap p-1">
                            <div className="gradient-border-content w-full h-full  ">
                              <Image
                                fill
                                sizes="(max-width: 768px) 100vw"
                                src={game.image}
                                alt={game.name}
                                priority={i === 0}
                                className="object-cover rounded-xl"
                              />
                            </div>
                          </div>

                          <div className="absolute right-4 bottom-4 z-10">
                            <SaveToggleButton
                              gameId={game.id}
                              initialSaved={savedSet?.has(game.id)}
                              onChange={(saved) =>
                                onSavedChange?.(game.id, saved)
                              }
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="w-[460px] h-[215px] bg-muted rounded-xl" />
                      )}

                      <CardContent className="bg-transparent pt-2 flex-1">
                        <h3 className="line-clamp-2 text-md font-semibold text-gray-200">
                          {game.name}
                        </h3>
                        {game.category && (
                          <div className="mt-1 text-sm font-medium text-gray-400">
                            {game.category}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </CarouselItem>
                ))}
          </CarouselContent>
        </Carousel>
      </div>
    </div>
  );
}
