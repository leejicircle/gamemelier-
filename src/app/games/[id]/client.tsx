'use client';

import { useEffect } from 'react';
import { useGameDetail } from '@/lib/hooks/useGameDetail';
import GamesCarousel from './components/GamesCarousel';
import Image from 'next/image';
import { Badge } from '@/components/ui/badge';
import ConfirmBuy from './components/ConfirmBuy';
import WishListButton from './components/WishListButton';
import { CardList } from './components/CardList';
import { SimilarGames } from './components/SimilarGames';
import { logEvent } from '@/lib/api/eventsApi';

export default function GameDetailClient({ id }: { id: number }) {
  const { data, isLoading, isError, error } = useGameDetail(id);

  // 상세 페이지 진입 로그 (비로그인이면 내부에서 no-op)
  useEffect(() => {
    void logEvent({ game_id: id, event_type: 'detail_view', source: 'detail' });
  }, [id]);

  if (isLoading) return <div>로딩 중...</div>;
  if (isError) return <div>에러 발생: {(error as Error).message}</div>;
  if (!data) return <div>데이터 없음</div>;
  function formatPrice(cents?: number | null) {
    if (cents == null) return '무료';
    const value = cents / 100;
    return `₩${value.toLocaleString('ko-KR')}`;
  }

  return (
    <section className="container-fluid justify-center">
      <div className="max-w-[1200px] mx-auto">
        <div>
          <h1 className="text-3xl font-bold text-white">{data.name}</h1>
        </div>
        <div className="flex flex-col desktop:flex-row mt-10 justify-center gap-10">
          <div className="flex-1 space-y-16 max-w-[800px]">
            <GamesCarousel
              videos={data.videos}
              screenshots={data.screenshots}
            />
            <div className="flex flex-col space-y-16 w-full justify-center">
              {data.summary && (
                <div>
                  <p className="text-white text-md whitespace-pre-line font-medium">
                    {data.summary}
                  </p>
                </div>
              )}
              <div className="grid grid-cols-2 tablet:grid-cols-4 gap-4 items-stretch">
                <CardList data={data} />
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-5 w-full desktop:w-[328px] shrink-0">
            <div>
              <Image
                className="rounded-lg w-full h-[120px] object-cover desktop:w-[328px] desktop:h-[100px]"
                src={data.header_image!}
                alt={data.name}
                width={328}
                height={100}
              />
              <div className="flex flex-wrap gap-2 mt-5 w-full ">
                {data.genres.map((genre) => (
                  <Badge
                    key={genre}
                    className=" bg-gray-700 text-white rounded-[100px] font-medium text-md"
                  >
                    {genre}
                  </Badge>
                ))}
              </div>

              {data.tags?.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3 w-full">
                  {data.tags.map((tag) => (
                    <Badge
                      key={tag}
                      className="bg-purple2/15 text-purple2 border border-purple2/30 rounded-[100px] font-medium text-md"
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}

              <div className="mt-[3.125rem]">
                {data.discount_percent && data.discount_percent > 0 && (
                  <div className="text-xl font-medium text-gray-600">
                    <span className="mr-2 text-white">
                      {data.discount_percent}%
                    </span>
                    <span className="line-through">
                      {formatPrice(data.price_initial_cents)}
                    </span>
                  </div>
                )}

                <div className="text-[28px] font-semibold text-white">
                  {formatPrice(data.price_final_cents)}
                </div>
              </div>

              <div className="flex flex-col gap-4 mt-4">
                <ConfirmBuy appId={data.id} />
                <WishListButton gameId={data.id} initialSaved={data.is_saved} />
              </div>
            </div>
          </div>
        </div>

        <SimilarGames gameId={data.id} />
      </div>
    </section>
  );
}
