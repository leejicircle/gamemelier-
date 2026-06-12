-- =============================================================================
-- 개인화 v1: 행동 이벤트 로그 + 게임 피드백 + 찜 세일 / 비슷한 게임 RPC
-- 적용: Supabase Dashboard > SQL Editor 에 붙여넣어 실행
--       (supabase CLI 연동 시 `supabase db push` 로도 적용 가능)
-- 참고: docs/personalization-plan.md 5장 (데이터 모델)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) user_events — 암묵 피드백(노출/클릭/조회 등) 적재. 모든 후속 단계의 연료.
-- -----------------------------------------------------------------------------
create table if not exists public.user_events (
  id          bigint generated always as identity primary key,
  user_id     uuid   not null references auth.users(id) on delete cascade,
  game_id     bigint references public.games(id) on delete cascade,
  event_type  text   not null check (event_type in
                ('impression','card_click','detail_view','save','unsave',
                 'dismiss','search_click','dwell')),
  value       real,            -- dwell ms, 검색 결과 위치 등 부가 수치
  source      text,            -- 'recommend_main' | 'wishlist_sale' | 'related' | 'detail' ...
  session_id  uuid,
  created_at  timestamptz not null default now()
);

create index if not exists user_events_user_created_idx
  on public.user_events (user_id, created_at desc);
create index if not exists user_events_game_type_idx
  on public.user_events (game_id, event_type);

alter table public.user_events enable row level security;

drop policy if exists user_events_insert_own on public.user_events;
create policy user_events_insert_own on public.user_events
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists user_events_select_own on public.user_events;
create policy user_events_select_own on public.user_events
  for select to authenticated
  using (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- 2) user_game_feedback — 명시/부정 피드백. dismissed = '관심 없음'.
-- -----------------------------------------------------------------------------
create table if not exists public.user_game_feedback (
  user_id    uuid   not null references auth.users(id) on delete cascade,
  game_id    bigint not null references public.games(id) on delete cascade,
  rating     smallint check (rating in (-1, 1)),
  dismissed  boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, game_id)
);

alter table public.user_game_feedback enable row level security;

-- for all(select/insert/update/delete) 단일 정책: 본인 행 한정이라 과권한 아님.
-- 현재 앱은 upsert(insert/update)만 사용하지만, 추후 평가 삭제 등을 위해 delete 도 열어둔다.
drop policy if exists user_game_feedback_all_own on public.user_game_feedback;
create policy user_game_feedback_all_own on public.user_game_feedback
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- 3) list_saved_on_sale — 내가 찜한 게임 중 현재 할인 중인 것.
--    security definer + auth.uid() 필터 (game_prices 에 select 정책이 없어도 동작).
--    통화가 여러 개인 게임은 KRW 우선으로 1행만.
-- -----------------------------------------------------------------------------
create or replace function public.list_saved_on_sale(p_limit int default 6)
returns table (
  id               bigint,
  name             text,
  image            text,
  discount_percent int,
  initial_cents    bigint,
  final_cents      bigint,
  currency         text,
  saved_at         timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, t.name, t.image, t.discount_percent,
         t.initial_cents, t.final_cents, t.currency, t.saved_at
  from (
    select distinct on (s.game_id)
           g.id,
           g.name,
           g.header_image as image,
           p.discount_percent,
           p.initial_cents::bigint,
           p.final_cents::bigint,
           p.currency,
           s.saved_at
    from user_saved_games s
    join games g        on g.id = s.game_id
    join game_prices p  on p.game_id = s.game_id
    where s.user_id = auth.uid()
      and coalesce(p.discount_percent, 0) > 0
    order by s.game_id, (p.currency = 'KRW') desc
  ) t
  order by t.discount_percent desc, t.saved_at desc
  limit p_limit;
$$;

revoke execute on function public.list_saved_on_sale(int) from public, anon;
grant  execute on function public.list_saved_on_sale(int) to authenticated;

-- -----------------------------------------------------------------------------
-- 4) list_similar_games — 장르 자카드(겹침 비율) 기반 비슷한 게임.
--    개인화 아님(아이템 기준) → 비로그인 포함 전원 사용 가능.
--    v2 에서 태그 자카드, v3 에서 임베딩 코사인으로 교체 예정 (시그니처 유지).
-- -----------------------------------------------------------------------------
create or replace function public.list_similar_games(
  p_game_id bigint,
  p_limit   int default 10
)
returns table (
  id    bigint,
  name  text,
  image text
)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select genre_id
    from game_genres
    where game_id = p_game_id
  ),
  cand as (
    -- 기준 게임과 장르가 1개 이상 겹치는 후보 + 교집합 크기
    select gg.game_id, count(*)::numeric as inter
    from game_genres gg
    join base b on b.genre_id = gg.genre_id
    where gg.game_id <> p_game_id
    group by gg.game_id
  ),
  scored as (
    -- 자카드 = 교집합 / 합집합
    select c.game_id,
           c.inter / (
             (select count(*) from base)
             + (select count(*) from game_genres g2 where g2.game_id = c.game_id)
             - c.inter
           ) as jaccard
    from cand c
  )
  select g.id, g.name, g.header_image as image
  from scored sc
  join games g on g.id = sc.game_id
  order by sc.jaccard desc, coalesce(g.reviews_total, 0) desc
  limit p_limit;
$$;

revoke execute on function public.list_similar_games(bigint, int) from public;
grant  execute on function public.list_similar_games(bigint, int) to anon, authenticated;
