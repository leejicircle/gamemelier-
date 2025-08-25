'use client';

import { useGameDetail } from '@/lib/hooks/useGameDetail';
import GamesCarousel from './components/GamesCarousel';
import Image from 'next/image';
import { Badge } from '@/components/ui/badge';
import ConfirmBuy from './components/ConfirmBuy';
import WishListButton from './components/WishListButton';
import { CardList } from './components/CardList';

export default function GameDetailClient({ id }: { id: number }) {
  const { data, isLoading, isError, error } = useGameDetail(id);

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
        <div className="flex mt-10 justify-center">
          <div className="flex-2 space-y-16">
            <GamesCarousel
              videos={data.videos}
              screenshots={data.screenshots}
            />
            <div className="flex-row space-y-16 w-[800px] justify-center">
              {data.summary && (
                <div>
                  <p className="text-white text-md whitespace-pre-line font-medium">
                    {data.summary}
                  </p>
                </div>
              )}
              <div className="flex justify-center gap-4 items-stretch">
                <CardList data={data} />
              </div>
            </div>
          </div>
          <div className="flex-row">
            <div>
              <Image
                className="rounded-lg w-[328px] h-[100px]"
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

              <div className="mt-12.5">
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

              <div className="flex-row space-y-4">
                <ConfirmBuy appId={data.id} />
                <WishListButton gameId={data.id} initialSaved={data.is_saved} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
