// 홈 page.tsx 는 이제 동기(hero 즉시 flush, 선반은 자체 Suspense)라 이 폴백은 홈에선 안 뜬다.
// 자체 loading.tsx 없는 다른 라우트의 기본 폴백으로 유지.
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
