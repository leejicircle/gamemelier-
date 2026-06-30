// 추천 초기진입 로딩 — page.tsx 가 auth + RPC 3개(recommend_games_cards 등)를
// SSR 블로킹하는 동안 표시. client.tsx 레이아웃(취향칩 줄 + 메인 그리드)을 모사.
import { CardsGrid } from '@/app/shared/components/CardsGrid';
import { Skeleton } from '@/components/ui/skeleton';

export default function RecommendLoading() {
  return (
    <section className="container-fluid">
      <div className="flex flex-wrap items-center gap-2 mb-8">
        <Skeleton className="h-6 w-16" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-24 rounded-full" />
        ))}
      </div>
      <CardsGrid title="개인 맞춤 추천" items={[]} isLoading />
    </section>
  );
}
