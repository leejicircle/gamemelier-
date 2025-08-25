'use client';

import { CardsGrid } from '@/app/shared/components/CardsGrid';

import { useRecommendCards } from '@/lib/hooks/useRecommendCards';
import GuestPage from '../shared/components/GuestPage';

type Props = {
  ssrUserId?: string;
  ssrBudgetCents?: number;
  ssrLimit?: number;
  ssrExcludeUpcoming?: boolean;
  ssrNickname?: string;
};

export default function RecommendClient({
  ssrUserId,
  ssrLimit = 30,
  ssrNickname,
}: Props) {
  const {
    data = [],
    isLoading,
    isError,
    error,
  } = useRecommendCards(ssrUserId, ssrLimit);

  if (!ssrUserId) {
    return <GuestPage />;
  }

  return (
    <section className="container-fluid">
      <CardsGrid
        title={ssrNickname ? '님을 위한 추천 게임' : '개인 맞춤 추천'}
        nickname={ssrNickname}
        items={data.slice(0, 6)}
        isLoading={isLoading}
      />
      {isError && (
        <p className="text-sm text-red-400">
          에러: {(error as Error)?.message}
        </p>
      )}
    </section>
  );
}
