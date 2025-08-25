'use client';

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';

export type Genre = { id: number; name: string };

export function useGenres() {
  return useQuery({
    queryKey: ['genres'],
    queryFn: async (): Promise<Genre[]> => {
      const { data, error } = await supabase.from('genres').select('id, name');
      if (error) throw error;

      return [{ id: -1, name: '전체' }, ...(data ?? [])];
    },
    staleTime: 60_000,
  });
}
