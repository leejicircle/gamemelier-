// 홈 초기진입 로딩 — page.tsx 가 topsellers·upcoming 을 SSR 블로킹하는 동안 표시.
// app/loading.tsx 는 자기 라우트(홈) 폴백이자, 자체 loading.tsx 없는 라우트의 기본 폴백.
// CardsCarousel 은 items=[] isLoading 이면 자체 스켈레톤만 그린다(데이터 fetch 없음).
import { CardsCarousel } from '@/app/shared/components/CardsCarousel';

export default function HomeLoading() {
  return (
    <section>
      <div className="absolute top-0 left-0 -z-2 h-[280px] tablet:h-[380px] desktop:h-[445px] w-full bg-purple2/5" />
      <div className="mt-[80px]">
        <div className="space-y-[60px] tablet:space-y-[80px] desktop:space-y-[120px] mb-[60px] tablet:mb-[80px] desktop:mb-[120px]">
          <CardsCarousel title="인기게임 TOP" items={[]} isLoading />
          <CardsCarousel title="출시예정" items={[]} isLoading />
        </div>
      </div>
    </section>
  );
}
