'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { PlayCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from '@/components/ui/carousel';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { MediaVideo, MediaShot } from '@/types';
import Image from 'next/image';
import { Button } from '@/components/ui/button';

type VideoSlide = {
  kind: 'video';
  src: string;
  poster?: string;
  alt: string;
};

type ImageSlide = {
  kind: 'image';
  src: string;
  thumb: string;
  alt: string;
};

type Slide = VideoSlide | ImageSlide;

type Props = {
  videos: MediaVideo[];
  screenshots: MediaShot[];
  className?: string;
  thumbClassName?: string;
};

export default function GamesCarousel({
  videos,
  screenshots,
  className,
}: Props) {
  const slides = useMemo<Slide[]>(
    () => [
      ...videos
        .filter((v) => !!v.mp4_max)
        .map<VideoSlide>((v) => ({
          kind: 'video',
          src: v.mp4_max as string,
          poster: v.thumbnail ?? undefined,
          alt: `video-${v.video_id}`,
        })),
      ...screenshots.map<ImageSlide>((s, i) => ({
        kind: 'image',
        src: s.url_full,
        thumb: s.url_thumb ?? s.url_full,
        alt: `screenshot-${i}`,
      })),
    ],
    [videos, screenshots],
  );

  const [api, setApi] = useState<CarouselApi | null>(null);
  const [current, setCurrent] = useState(0);
  const videoRefs = useRef<Array<HTMLVideoElement | null>>([]);

  useEffect(() => {
    if (!api) return;
    setCurrent(api.selectedScrollSnap());

    const onSelect = () => {
      videoRefs.current.forEach((video) => {
        try {
          if (video && !video.paused) video.pause();
        } catch {}
      });
      setCurrent(api.selectedScrollSnap());
    };

    api.on('select', onSelect);
    return () => {
      api.off('select', onSelect);
    };
  }, [api]);

  const handleThumbClick = (index: number) => api?.scrollTo(index);

  if (slides.length === 0) {
    const skeletonThumbCount = 5;
    return (
      <div className={cn('flex-row justify-center', className)}>
        <div className="max-w-[800px]">
          <Card className="border-0 bg-transparent">
            <CardContent className="relative flex aspect-video items-center justify-center p-0 overflow-hidden rounded-2xl">
              <Skeleton className="absolute inset-0 h-full w-full" />
            </CardContent>
          </Card>
        </div>

        <div className="flex w-[800px] justify-center gap-4 mt-4 overflow-x-auto py-2">
          {Array.from({ length: skeletonThumbCount }).map((_, index) => (
            <div
              key={index}
              className="flex p-0 w-[136px] h-[64px] rounded-sm overflow-hidden"
              aria-hidden
            >
              <Skeleton className="h-full w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const thumbItems = slides.slice(0, 5);

  return (
    <div className={cn('flex-row justify-center', className)}>
      <Carousel
        setApi={setApi}
        className="max-w-[800px] group"
        opts={{ loop: true }}
      >
        <CarouselContent>
          {slides.map((item, index) => (
            <CarouselItem key={index}>
              <Card className="border-0 bg-transparent">
                <CardContent className="relative flex aspect-video items-center justify-center p-0 overflow-hidden rounded-2xl">
                  {item.kind === 'image' ? (
                    <>
                      <Image
                        fill
                        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 800px"
                        src={item.src}
                        alt={item.alt}
                        className="object-cover"
                        priority={index === 0}
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        <PlayCircle className="w-20 h-20 text-white opacity-80" />
                      </div>
                    </>
                  ) : (
                    <>
                      <video
                        ref={(el) => {
                          videoRefs.current[index] = el;
                        }}
                        controls={current === index}
                        playsInline
                        preload="metadata"
                        poster={item.poster || undefined}
                        className="w-full h-full object-cover"
                      >
                        <source src={item.src} type="video/mp4" />
                      </video>
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        <PlayCircle className="w-20 h-20 text-white opacity-80" />
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </CarouselItem>
          ))}
        </CarouselContent>

        <CarouselPrevious className="absolute left-4 top-1/2 -translate-y-1/2 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        <CarouselNext className="absolute right-4 top-1/2 -translate-y-1/2 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </Carousel>

      <div className="flex w-[800px] justify-center gap-4 mt-4 overflow-x-auto py-2">
        {thumbItems.map((item, index) => {
          const isActive = index === current;
          const isVideo = item.kind === 'video';
          const thumbSrc = isVideo ? (item.poster ?? '') : item.thumb;

          return (
            <Button
              key={index}
              onClick={() => handleThumbClick(index)}
              className={cn(
                'flex p-0 w-[136px] h-[64px]  focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-black focus:ring-white',

                isActive
                  ? 'border-white opacity-100'
                  : 'border-transparent opacity-50 hover:opacity-75',
              )}
              aria-label={`thumbnail-${index}`}
            >
              <div className="relative w-full h-full overflow-hidden rounded-sm">
                {thumbSrc ? (
                  <Image
                    fill
                    sizes="136px"
                    src={thumbSrc}
                    alt={`thumb-${index}`}
                  />
                ) : (
                  <div className="w-full h-full bg-black" />
                )}
                {isVideo && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <PlayCircle className="w-20 h-20 text-white drop-shadow" />
                  </div>
                )}
              </div>
            </Button>
          );
        })}
      </div>
    </div>
  );
}
