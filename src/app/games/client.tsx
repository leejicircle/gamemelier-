'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Pagination from '@/app/shared/components/sharedPagination';
import { CardsGrid } from '@/app/shared/components/CardsGrid';
import { useGamesPage } from '@/lib/hooks/useGamesPage';
import { useGenres } from '@/lib/hooks/useGenres';
import GenreFilter from './components/GenreFilter';

export default function GamesClient({
  ssrPage,
  ssrPageSize,
  ssrGenre,
}: {
  ssrPage: number;
  ssrPageSize: number;
  ssrGenre: number;
}) {
  const router = useRouter();
  const [page, setPage] = useState(ssrPage);
  const [selectedGenreId, setSelectedGenreId] = useState(ssrGenre);

  const { data: genres = [] } = useGenres();

  const sportsId = useMemo(
    () => genres.find((g) => g.name === '스포츠')?.id,
    [genres],
  );
  const racingId = useMemo(
    () => genres.find((g) => g.name === '레이싱')?.id,
    [genres],
  );

  const displayGenres = useMemo(() => {
    const ALLOW = new Set(['액션', 'RPG', '전략', '어드벤처', '시뮬레이션']);
    const list = genres.filter((g) => ALLOW.has(g.name));

    if (!list.some((g) => g.id === -1)) {
      list.unshift({ id: -1, name: '전체' } as { id: number; name: string });
    }
    if (
      (typeof sportsId === 'number' || typeof racingId === 'number') &&
      !list.some((g) => g.id === -100)
    ) {
      list.push({ id: -100, name: '스포츠·레이싱' } as {
        id: number;
        name: string;
      });
    }
    return list;
  }, [genres, sportsId, racingId]);

  const genreIds = useMemo(() => {
    if (selectedGenreId === -1) return undefined;
    if (selectedGenreId === -100) {
      const ids = [sportsId, racingId].filter(
        (v): v is number => typeof v === 'number',
      );
      return ids.length ? ids : undefined;
    }
    return [selectedGenreId];
  }, [selectedGenreId, sportsId, racingId]);

  const { data, isLoading } = useGamesPage(page, ssrPageSize, genreIds, null);

  const items = data?.items ?? [];
  const totalCount = data?.totalCount ?? 0;
  const hasPrev = data?.hasPrev ?? false;
  const hasNext = data?.hasNext ?? false;
  const totalPages = Math.max(1, Math.ceil(totalCount / ssrPageSize));

  function syncUrl(nextPage: number, nextGenreId: number) {
    const params = new URLSearchParams();
    params.set('page', String(nextPage));
    params.set('pageSize', String(ssrPageSize));
    params.set('genre', String(nextGenreId));
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  return (
    <section className="container-fluid space-y-6">
      <GenreFilter
        genres={displayGenres}
        selectedId={selectedGenreId}
        onChange={(id) => {
          setSelectedGenreId(id);
          setPage(1);
          syncUrl(1, id);
        }}
      />
      <CardsGrid
        title="전체 게임"
        items={items}
        isLoading={isLoading}
        totalCount={totalCount}
      />

      <Pagination
        page={page}
        totalPages={totalPages}
        totalCount={totalCount}
        isLoading={isLoading}
        hasPrev={hasPrev}
        hasNext={hasNext}
        onPageChange={(nextPage) => {
          if (isLoading) return;
          setPage(nextPage);
          syncUrl(nextPage, selectedGenreId);
        }}
      />
    </section>
  );
}
