// 전체 게임 초기진입 로딩 — page.tsx 가 list_games_cards 를 SSR 블로킹하는 동안 표시.
// client.tsx 레이아웃(장르 필터 줄 + 카드 그리드)을 모사.
import { CardsGrid } from '@/app/shared/components/CardsGrid';
import { Skeleton } from '@/components/ui/skeleton';

export default function GamesLoading() {
  return (
    <section className="container-fluid space-y-6">
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-20 rounded-full" />
        ))}
      </div>
      <CardsGrid title="게임" items={[]} isLoading />
    </section>
  );
}
