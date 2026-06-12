import { QueryClient, dehydrate } from '@tanstack/react-query';
import { HydrationBoundary } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/server';
import RecommendClient from './client';
import type { CardItem } from '@/types';

type Params = {
  budgetCents?: string;
  limit?: string;
  excludeUpcoming?: string;
};

export default async function RecommendPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const params = await searchParams;
  const budgetCents = params?.budgetCents
    ? Number(params.budgetCents)
    : undefined;
  // '관심 없음' 제외 후에도 6장을 채울 수 있도록 여유분 포함 12장 조회
  const limit = 12;
  const excludeUpcoming = params?.excludeUpcoming !== 'false';

  const qc = new QueryClient();
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user?.id ?? undefined;

  let nickname: string | undefined;
  if (userId) {
    const { data: prof, error: profErr } = await supabase
      .from('profiles')
      .select('nickname')
      .eq('id', userId)
      .maybeSingle();
    if (!profErr && prof?.nickname) nickname = prof.nickname as string;

    await qc.prefetchQuery({
      queryKey: [
        'recommend-cards',
        userId,
        budgetCents,
        limit,
        excludeUpcoming,
      ],
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

  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <RecommendClient
        ssrUserId={userId}
        ssrBudgetCents={budgetCents}
        ssrLimit={limit}
        ssrExcludeUpcoming={excludeUpcoming}
        ssrNickname={nickname}
      />
    </HydrationBoundary>
  );
}
