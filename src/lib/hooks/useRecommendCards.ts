'use client';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { CardItem } from '@/types';

export function useRecommendCards(
  userId?: string,
  budgetCents?: number,
  limit = 30,
  excludeUpcoming = true,
) {
  return useQuery({
    queryKey: ['recommend-cards', userId, budgetCents, limit, excludeUpcoming],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('recommend_games_cards', {
        p_user: userId,
        p_budget_cents: budgetCents ?? null,
        p_limit: limit,
        p_exclude_upcoming: excludeUpcoming,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as CardItem[];
    },
    staleTime: 60_000,
  });
}
