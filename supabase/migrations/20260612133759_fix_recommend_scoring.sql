-- =============================================================================
-- v2-2 후속 수정 (PR #18 자체 리뷰 반영)
-- 적용: 이미 prod 적용됨 (MCP, 이력 version 20260612133759). 신규 환경은 `supabase db push`.
--
--   1) trg_saved_games_weight 멱등 등록 — 기존 prod 엔 존재하나 레포/재생성 정합용
--   2) recommend_games_cards 점수 보정:
--      - 태그 IDF 음수 클리핑(보편 태그가 취향에 역패널티 주는 것 방지)
--      - 베이지안 평판 NULL 방어(total_positive/negative 한쪽만 NULL 인 경우)
--      - tag_score 상한(IDF×weight 폭주로 다른 점수 압도 방지)
--      - 동점 tiebreak 에 id 추가(안정 정렬)
-- =============================================================================

-- 1) 트리거 멱등 등록 (정의는 기존과 동일)
create or replace trigger trg_saved_games_weight
  after insert or delete on public.user_saved_games
  for each row execute function public.bump_weight_on_save();

-- 2) recommend_games_cards 점수 보정
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
  -- 태그 IDF: 0 미만으로는 내려가지 않게 클리핑(보편 태그가 역패널티 주지 않도록)
  tag_idf as (
    select gt.tag_id,
           greatest(
             ln( (select greatest(count(*), 1) from public.games)::numeric / (1 + count(*)) ),
             0.0
           ) as idf
    from public.game_tags gt
    group by gt.tag_id
  ),
  prior as (
    select coalesce(avg(positive_ratio), 0.80) as prior_c
    from public.games
    where positive_ratio is not null
  ),
  cand as (
    select
      ga.id, ga.name,
      coalesce(ga.header_image, (select url from public.covers c where c.id = ga.id)) as image,
      ga.first_release_date, ga.total_positive, ga.total_negative,
      coalesce(
        (select gp.final_cents from public.game_prices gp where gp.game_id = ga.id and gp.currency = 'KRW'),
        (select gp.final_cents from public.game_prices gp where gp.game_id = ga.id and gp.currency = 'USD')
      ) as price_cents,
      coalesce((select max(gp.discount_percent) from public.game_prices gp where gp.game_id = ga.id), 0) as discount_percent,
      coalesce((
        select sum(fg.weight) from public.game_genres gg
        join fav_genre fg on fg.genre_id = gg.genre_id
        where gg.game_id = ga.id
      ), 0) as genre_score,
      coalesce((
        select sum(ft.weight * ti.idf) from public.game_tags gt
        join fav_tag ft on ft.tag_id = gt.tag_id
        join tag_idf ti on ti.tag_id = gt.tag_id
        where gt.game_id = ga.id
      ), 0) as tag_score
    from public.games ga
  ),
  scored as (
    select c.*,
      -- 베이지안 평판(0~1). 한쪽만 NULL 이어도 0 으로 방어. 리뷰 없으면 0.5.
      case
        when coalesce(c.total_positive, 0) + coalesce(c.total_negative, 0) > 0
        then (coalesce(c.total_positive, 0) + 2000 * (select prior_c from prior))
             / (coalesce(c.total_positive, 0) + coalesce(c.total_negative, 0) + 2000.0)
        else 0.5
      end as quality,
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
    and not exists (select 1 from public.user_saved_games us where us.user_id = p_user and us.game_id = s.id)
    and not exists (select 1 from public.user_game_feedback uf where uf.user_id = p_user and uf.game_id = s.id and uf.dismissed)
  order by
    -- tag_score 는 상한 8.0 으로 클리핑(IDF×weight 폭주가 평판·신선도를 압도하지 않도록)
    ( s.genre_score * 6
    + least(s.tag_score, 8.0) * 4
    + s.quality * 50
    + s.recency * 0.3
    + s.discount_percent * 0.4
    ) desc,
    s.first_release_date desc nulls last,
    s.id desc
  limit greatest(p_limit, 1);
$function$;
