-- =============================================================================
-- 개인화 v2-2: 추천 RPC 종합 점수화 + 태그 취향
-- 적용: 이미 prod 적용됨 (MCP, 이력 version 20260612131900). 신규 환경은 `supabase db push`.
-- 참고: docs/personalization-plan.md 4장(점수 설계)
--
-- 구성:
--   1) user_tag_preferences  — 저장 기반 태그 취향 (user_genre_preferences 의 태그 버전)
--   2) bump_weight_on_save    — 저장 시 장르 + 태그 동시 적립하도록 확장
--   3) recommend_games_cards  — 장르·태그(IDF) 취향 + 베이지안 평판 + 할인/신작 부스트
--                               + 이미 저장/관심없음 게임 제외, 단일 종합 점수 정렬
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) user_tag_preferences — RLS 4정책은 user_genre_preferences 와 동일 패턴
-- -----------------------------------------------------------------------------
create table if not exists public.user_tag_preferences (
  user_id uuid    not null references auth.users(id) on delete cascade,
  tag_id  bigint  not null references public.tags(id) on delete cascade,
  weight  numeric not null default 0,
  primary key (user_id, tag_id)
);

alter table public.user_tag_preferences enable row level security;

drop policy if exists utp_select_own on public.user_tag_preferences;
create policy utp_select_own on public.user_tag_preferences
  for select using (auth.uid() = user_id);

drop policy if exists utp_insert_own on public.user_tag_preferences;
create policy utp_insert_own on public.user_tag_preferences
  for insert with check (auth.uid() = user_id);

drop policy if exists utp_update_own on public.user_tag_preferences;
create policy utp_update_own on public.user_tag_preferences
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists utp_delete_own on public.user_tag_preferences;
create policy utp_delete_own on public.user_tag_preferences
  for delete using (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- 2) bump_weight_on_save — 저장 시 장르 + 태그 동시 적립 (저장 해제 시 감소)
-- -----------------------------------------------------------------------------
create or replace function public.bump_weight_on_save()
returns trigger
language plpgsql
as $function$
begin
  if (tg_op = 'INSERT') then
    -- 장르 +0.25 (상한 3.0)
    insert into public.user_genre_preferences(user_id, genre_id, weight)
    select new.user_id, gg.genre_id, 0.25
    from public.game_genres gg
    where gg.game_id = new.game_id
    on conflict (user_id, genre_id) do update
      set weight = least(user_genre_preferences.weight + 0.25, 3.0);

    -- 태그 +0.25 (상한 3.0)
    insert into public.user_tag_preferences(user_id, tag_id, weight)
    select new.user_id, gt.tag_id, 0.25
    from public.game_tags gt
    where gt.game_id = new.game_id
    on conflict (user_id, tag_id) do update
      set weight = least(user_tag_preferences.weight + 0.25, 3.0);
    return new;

  elsif (tg_op = 'DELETE') then
    update public.user_genre_preferences ugp
    set weight = greatest(ugp.weight - 0.15, 0.0)
    from public.game_genres gg
    where ugp.user_id = old.user_id
      and gg.game_id = old.game_id
      and ugp.genre_id = gg.genre_id;

    update public.user_tag_preferences utp
    set weight = greatest(utp.weight - 0.15, 0.0)
    from public.game_tags gt
    where utp.user_id = old.user_id
      and gt.game_id = old.game_id
      and utp.tag_id = gt.tag_id;
    return old;
  end if;

  return null;
end
$function$;

-- -----------------------------------------------------------------------------
-- 3) recommend_games_cards — 종합 점수 정렬
--    점수 = 장르취향*6 + 태그취향(weight×IDF)*4 + 베이지안평판*50 + 신선도*0.3 + 할인*0.4
--    (가중치는 초기값. 이벤트 데이터 쌓이면 튜닝)
-- -----------------------------------------------------------------------------
create or replace function public.recommend_games_cards(
  p_user uuid,
  p_budget_cents integer default null,
  p_limit integer default 30,
  p_exclude_upcoming boolean default true
)
returns table(id bigint, name text, image text)
language sql
stable
as $function$
  with
  fav_genre as (
    select genre_id, weight
    from public.user_genre_preferences
    where user_id = p_user
    union all
    select g.id, 1.0
    from public.profiles pf
    join lateral unnest(coalesce(pf.favorite_genres, '{}')) fn(name) on true
    join public.genres g on lower(g.name) = lower(fn.name)
    where pf.id = p_user
  ),
  fav_tag as (
    select tag_id, weight
    from public.user_tag_preferences
    where user_id = p_user
  ),
  -- 태그 IDF: 흔한 태그는 약하게, 희귀 태그는 강하게
  tag_idf as (
    select gt.tag_id,
           ln( (select greatest(count(*), 1) from public.games)::numeric / (1 + count(*)) ) as idf
    from public.game_tags gt
    group by gt.tag_id
  ),
  -- 베이지안 prior C = 전체 평균 긍정률 (없으면 0.80)
  prior as (
    select coalesce(avg(positive_ratio), 0.80) as prior_c
    from public.games
    where positive_ratio is not null
  ),
  cand as (
    select
      ga.id,
      ga.name,
      coalesce(ga.header_image, (select url from public.covers c where c.id = ga.id)) as image,
      ga.first_release_date,
      ga.total_positive,
      ga.total_negative,
      coalesce(
        (select gp.final_cents from public.game_prices gp where gp.game_id = ga.id and gp.currency = 'KRW'),
        (select gp.final_cents from public.game_prices gp where gp.game_id = ga.id and gp.currency = 'USD')
      ) as price_cents,
      coalesce(
        (select max(gp.discount_percent) from public.game_prices gp where gp.game_id = ga.id),
        0
      ) as discount_percent,
      -- 장르 취향 점수
      coalesce((
        select sum(fg.weight)
        from public.game_genres gg
        join fav_genre fg on fg.genre_id = gg.genre_id
        where gg.game_id = ga.id
      ), 0) as genre_score,
      -- 태그 취향 점수 (취향 weight × 태그 IDF)
      coalesce((
        select sum(ft.weight * ti.idf)
        from public.game_tags gt
        join fav_tag ft on ft.tag_id = gt.tag_id
        join tag_idf ti on ti.tag_id = gt.tag_id
        where gt.game_id = ga.id
      ), 0) as tag_score
    from public.games ga
  ),
  scored as (
    select
      c.*,
      -- 베이지안 평판(0~1). 리뷰 없으면 중립 0.5.
      case
        when coalesce(c.total_positive, 0) + coalesce(c.total_negative, 0) > 0
        then (c.total_positive + 2000 * (select prior_c from prior))
             / (c.total_positive + c.total_negative + 2000.0)
        else 0.5
      end as quality,
      -- 신선도(0~100): 90일 감쇠. 미출시는 0.
      case
        when c.first_release_date is null or c.first_release_date > now() then 0
        else 100 * exp( - greatest(date_part('day', now() - c.first_release_date), 0) / 90.0 )
      end as recency
    from cand c
  )
  select s.id, s.name, s.image
  from scored s
  where (p_budget_cents is null or s.price_cents is null or s.price_cents <= p_budget_cents)
    and (not p_exclude_upcoming or s.first_release_date is null or s.first_release_date <= now())
    -- 이미 저장한 게임 제외
    and not exists (
      select 1 from public.user_saved_games us
      where us.user_id = p_user and us.game_id = s.id
    )
    -- '관심 없음' 표시한 게임 제외
    and not exists (
      select 1 from public.user_game_feedback uf
      where uf.user_id = p_user and uf.game_id = s.id and uf.dismissed
    )
  order by
    ( s.genre_score * 6
    + s.tag_score * 4
    + s.quality * 50
    + s.recency * 0.3
    + s.discount_percent * 0.4
    ) desc,
    s.first_release_date desc nulls last
  limit greatest(p_limit, 1);
$function$;
