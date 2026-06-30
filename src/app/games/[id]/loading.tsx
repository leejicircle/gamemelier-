// 게임 상세 초기진입 로딩 — page.tsx 가 get_game_detail 을 SSR 블로킹하는 동안 표시.
// client.tsx 레이아웃(좌: 미디어+카드리스트 / 우: 표지+장르·태그+가격+버튼)을 모사.
import { Skeleton } from '@/components/ui/skeleton';

export default function GameDetailLoading() {
  return (
    <section className="container-fluid justify-center">
      <div className="max-w-[1200px] mx-auto">
        <Skeleton className="h-9 w-1/2" />
        <div className="flex flex-col desktop:flex-row mt-10 justify-center gap-10">
          <div className="flex-1 space-y-16 max-w-[800px]">
            <Skeleton className="w-full aspect-video rounded-xl" />
            <div className="grid grid-cols-2 tablet:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full rounded-lg" />
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-5 w-full desktop:w-[328px] shrink-0">
            <Skeleton className="w-full h-[120px] desktop:h-[100px] rounded-lg" />
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-7 w-16 rounded-full" />
              ))}
            </div>
            <Skeleton className="h-10 w-32 mt-8" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </div>
      </div>
    </section>
  );
}
