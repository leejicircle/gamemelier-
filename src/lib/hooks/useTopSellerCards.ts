'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchTopSellerIds,
  fetchCardsByOrderedIdsServer,
} from '@/lib/api/topSellers';
import type { CardItem } from '@/types/games';
import { useEffect } from 'react';
export function useTopSellerCards(limit = 30, offset = 0) {
  const qc = useQueryClient();

  const topSellerIdsQuery = useQuery({
    queryKey: ['top-seller-ids', limit, offset] as const,
    queryFn: () => fetchTopSellerIds(limit, offset),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    placeholderData: (prev) => prev,
  });

  const ids = topSellerIdsQuery.data?.ids ?? [];
  const cardsQuery = useQuery<CardItem[], Error>({
    queryKey: ['top-seller-cards', limit, offset, ids] as const,
    enabled: ids.length > 0,
    queryFn: () => fetchCardsByOrderedIdsServer(ids),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    placeholderData: (prev) => prev,
  });

  const nextOffset = topSellerIdsQuery.data?.nextOffset ?? null;
  useEffect(() => {
    if (nextOffset !== null) {
      qc.prefetchQuery({
        queryKey: ['top-seller-ids', limit, nextOffset] as const,
        queryFn: () => fetchTopSellerIds(limit, nextOffset),
        staleTime: 60_000,
      });
    }
  }, [qc, limit, nextOffset]);

  return { topSellerIdsQuery, cardsQuery, nextOffset };
}
