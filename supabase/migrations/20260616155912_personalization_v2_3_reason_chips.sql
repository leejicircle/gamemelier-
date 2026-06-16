-- =============================================================================
-- 개인화 v2-3: 추천 UI 근거 (이유 배지 · 취향 칩 · 최근 저장 기반 유사작)
-- 적용: 이미 prod 적용됨 (MCP, 이력 version 20260616155912). 신규 환경은 `supabase db push`.
-- 참고: docs/personalization-plan.md 6장(UI 계획)
--
-- 구성:
--   1) recommend_games_cards      — 기존 점수/정렬 유지 + reason/reason_kind 반환
--                                   (반환 컬럼 추가라 DROP 후 재생성)
--   2) get_taste_chips            — 취향 칩(상위 장르 + 비중)
--   3) recommend_from_recent_save — 최근 저장 게임 기준 유사작 선반(B)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) recommend_games_cards — 추천 이유(reason) 동봉
--    reason 우선순위(설명 가능성 순): 취향장르 → 취향태그 → 할인 → 평판 → 최신작
--    (휴리스틱. 점수 정렬 자체는 v2-2 와 동일)
-- -----------------------------------------------------------------------------
drop function if exists public.recommend_games_cards(uuid, integer, integer, boolean);

create function public.recommend_games_cards(
  p_user uuid,
  p_budget_cents integer default null,
  p_limit integer default 30,
  p_exclude_upcoming boolean default true
)
returns table(id bigint, name text, image text, reason text, reason_kind text)
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
      ga.positive_ratio, ga.review_score_desc,
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
      ), 0) as tag_score,
      -- 취향과 겹치는 대표 장르/태그명 (이유 배지 라벨용)
      (
        select g.name from public.game_genres gg
        join fav_genre fg on fg.genre_id = gg.genre_id
        join public.genres g on g.id = gg.genre_id
        where gg.game_id = ga.id
        order by fg.weight desc limit 1
      ) as top_genre,
      (
        select t.name from public.game_tags gt
        join fav_tag ft on ft.tag_id = gt.tag_id
        join public.tags t on t.id = gt.tag_id
        where gt.game_id = ga.id
        order by ft.weight desc limit 1
      ) as top_tag
    from public.games ga
  ),
  scored as (
    select c.*,
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
  ),
  reasoned as (
    select s.*,
      case
        when s.top_genre is not null and s.genre_score >= 0.5 then 'genre'
        when s.top_tag is not null and s.tag_score >= 0.5 then 'tag'
        when s.discount_percent >= 10 then 'discount'
        when s.review_score_desc in ('Overwhelmingly Positive','Very Positive')
          or (s.positive_ratio is not null and s.positive_ratio >= 0.90) then 'quality'
        when s.first_release_date is not null
          and s.first_release_date >= now() - interval '30 days'
          and s.first_release_date <= now() then 'recency'
        else null
      end as reason_kind
    from scored s
  )
  select r.id, r.name, r.image,
    case r.reason_kind
      when 'genre'    then '취향 장르 · ' || r.top_genre
      when 'tag'      then '취향 태그 · ' || r.top_tag
      when 'discount' then '할인 -' || r.discount_percent || '%'
      when 'quality'  then case r.review_score_desc
                             when 'Overwhelmingly Positive' then '압도적으로 긍정적'
                             when 'Very Positive'           then '매우 긍정적'
                             else round((r.positive_ratio * 100)::numeric)::text || '% 호평'
                           end
      when 'recency'  then '최신작'
      else null
    end as reason,
    r.reason_kind
  from reasoned r
  where (p_budget_cents is null or r.price_cents is null or r.price_cents <= p_budget_cents)
    and (not p_exclude_upcoming or r.first_release_date is null or r.first_release_date <= now())
    and not exists (select 1 from public.user_saved_games us where us.user_id = p_user and us.game_id = r.id)
    and not exists (select 1 from public.user_game_feedback uf where uf.user_id = p_user and uf.game_id = r.id and uf.dismissed)
  order by
    ( r.genre_score * 6
    + least(r.tag_score, 8.0) * 4
    + r.quality * 50
    + r.recency * 0.3
    + r.discount_percent * 0.4
    ) desc,
    r.first_release_date desc nulls last,
    r.id desc
  limit greatest(p_limit, 1);
$function$;

-- -----------------------------------------------------------------------------
-- 2) get_taste_chips — 취향 칩 (상위 장르 + 전체 대비 비중)
--    share = weight / 본인 전체 장르 weight 합 (0~1). genres.name 은 이미 한글.
--    INVOKER + RLS(user_genre_preferences) 라 본인 취향만 조회된다.
-- -----------------------------------------------------------------------------
create or replace function public.get_taste_chips(
  p_user uuid,
  p_limit integer default 3
)
returns table(genre_id bigint, name text, weight numeric, share numeric)
language sql
stable
as $function$
  with prefs as (
    select ugp.genre_id, ugp.weight, g.name
    from public.user_genre_preferences ugp
    join public.genres g on g.id = ugp.genre_id
    where ugp.user_id = p_user and ugp.weight > 0
  ),
  tot as (select nullif(sum(weight), 0) as s from prefs)
  select p.genre_id, p.name, p.weight,
         round((p.weight / (select s from tot))::numeric, 4) as share
  from prefs p
  order by p.weight desc, p.name
  limit greatest(p_limit, 1);
$function$;

-- -----------------------------------------------------------------------------
-- 3) recommend_from_recent_save — 선반 B: "'X'를 저장하셔서"
--    가장 최근 저장한 게임을 앵커로 장르 자카드 유사작. 앵커명을 각 행에 동봉.
--    이미 저장/관심없음/앵커 자신은 제외. 저장 0건이면 빈 결과 → 선반 숨김.
-- -----------------------------------------------------------------------------
create or replace function public.recommend_from_recent_save(
  p_user uuid,
  p_limit integer default 6
)
returns table(anchor_id bigint, anchor_name text, id bigint, name text, image text)
language sql
stable
as $function$
  with anchor as (
    select usg.game_id as gid, g.name as gname
    from public.user_saved_games usg
    join public.games g on g.id = usg.game_id
    where usg.user_id = p_user
    order by usg.saved_at desc
    limit 1
  ),
  base as (
    select gg.genre_id
    from public.game_genres gg
    join anchor a on a.gid = gg.game_id
  ),
  cand as (
    select gg.game_id, count(*)::numeric as inter
    from public.game_genres gg
    join base b on b.genre_id = gg.genre_id
    where gg.game_id <> (select gid from anchor)
    group by gg.game_id
  ),
  scored as (
    select c.game_id,
           c.inter / (
             (select count(*) from base)
             + (select count(*) from public.game_genres g2 where g2.game_id = c.game_id)
             - c.inter
           ) as jaccard
    from cand c
  )
  select (select gid from anchor)   as anchor_id,
         (select gname from anchor) as anchor_name,
         g.id, g.name, g.header_image as image
  from scored sc
  join public.games g on g.id = sc.game_id
  where not exists (select 1 from public.user_saved_games us where us.user_id = p_user and us.game_id = g.id)
    and not exists (select 1 from public.user_game_feedback uf where uf.user_id = p_user and uf.game_id = g.id and uf.dismissed)
  order by sc.jaccard desc, coalesce(g.reviews_total, 0) desc
  limit greatest(p_limit, 1);
$function$;
