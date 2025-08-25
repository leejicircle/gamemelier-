'use client';

import { useState } from 'react';
import { CardsGrid } from '@/app/shared/components/CardsGrid';
import { useUpcomingCardsPage } from '@/lib/hooks/useUpcomingCards';
import type { CardItem } from '@/types/games';
import Pagination from '../shared/components/sharedPagination';

type Props = {
  pageSize?: number;
};

export default function UpcomingClient({ pageSize = 15 }: Props) {
  const [page, setPage] = useState<number>(1);

  const { data, isLoading, isError, error } = useUpcomingCardsPage(
    page,
    pageSize,
  );
  const items = (data?.items ?? []) as CardItem[];
  const totalCount = data?.totalCount ?? 0;
  const hasPrev = data?.hasPrev ?? false;
  const hasNext = data?.hasNext ?? false;

  const isEmpty = !isLoading && !isError && items.length === 0;
  const totalPages = Math.ceil(totalCount / pageSize);
  return (
    <section className="container-fluid">
      <CardsGrid
        title="출시 예정작"
        items={items as CardItem[]}
        isLoading={isLoading}
        totalCount={totalCount}
      />

      {isError && (
        <p className="mt-4 text-sm text-red-400">
          불러오는 중 오류가 발생했어요: {String(error)}
        </p>
      )}
      {isEmpty && (
        <p className="mt-4 text-sm text-muted-foreground">
          표시할 게임이 없습니다.
        </p>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        totalCount={totalCount}
        isLoading={isLoading}
        hasPrev={hasPrev}
        hasNext={hasNext}
        onPageChange={setPage}
      />
    </section>
  );
}
