'use client';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import type { SaleItem } from '@/types';

/**
 * 내가 찜한 게임 중 현재 할인 중인 목록.
 * RPC 미배포/에러 시 빈 배열 — 선반이 조용히 숨도록 한다.
 */
export function useSavedOnSale(userId?: string, limit = 6) {
  return useQuery({
    queryKey: ['saved-on-sale', userId, limit],
    enabled: !!userId,
    queryFn: async (): Promise<SaleItem[]> => {
      const { data, error } = await supabase.rpc('list_saved_on_sale', {
        p_limit: limit,
      });
      if (error) return [];
      return (data ?? []) as SaleItem[];
    },
    staleTime: 60_000,
  });
}
