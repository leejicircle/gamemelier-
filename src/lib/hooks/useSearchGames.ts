'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

export type SearchItem = {
  id: number;
  name: string;
  image: string | null;
  score: number;
};

function useDebouncedValue<T>(value: T, delayMilliseconds = 250): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const timerId = setTimeout(
      () => setDebouncedValue(value),
      delayMilliseconds,
    );
    return () => clearTimeout(timerId);
  }, [value, delayMilliseconds]);
  return debouncedValue;
}

export function useSearchGames(searchText: string, limit = 8) {
  const debouncedSearchText = useDebouncedValue(searchText, 250);

  return useQuery<SearchItem[]>({
    queryKey: ['search', debouncedSearchText, limit],
    queryFn: async (): Promise<SearchItem[]> => {
      const response = await fetch(
        `/api/search?query=${encodeURIComponent(debouncedSearchText)}&limit=${limit}`,
      );
      if (!response.ok) {
        throw new Error('검색 요청에 실패했습니다.');
      }
      const jsonBody: { items: SearchItem[] } = await response.json();
      return jsonBody.items;
    },
    enabled: debouncedSearchText.trim().length >= 1,
    staleTime: 30_000,
  });
}
