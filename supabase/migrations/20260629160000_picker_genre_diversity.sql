-- =============================================================================
-- 온보딩 픽커 장르 다양성: list_picker_games 를 리뷰순 24 → 카테고리 라운드로빈으로
-- 적용: `supabase db push` 또는 MCP apply_migration (prod 적용됨).
--
-- 문제: 기존 list_picker_games 는 reviews_total 순 상위 24 → 대표 카테고리 액션 18/24,
--   전략 1·스포츠·레이싱 0 으로 쏠려, 니치 장르 취향 유저가 고를 게임이 없었다.
--   (스코어링 재균형이 태그를 우대하는데, 픽커가 태그 취향을 시드하므로 다양한 장르를
--    보여줘야 니치 유저도 태그 취향이 생긴다 — 두 작업이 맞물림.)
-- 해결: 게임을 대표 카테고리(parent_category_of_one)로 묶고, 각 카테고리에서 리뷰순으로
--   라운드로빈 → 7개 카테고리 상위작이 골고루. 카테고리 안에선 최상위 리뷰작이라 인지도 유지.
-- =============================================================================

create or replace function public.list_picker_games(p_limit integer default 24)
returns table(id bigint, name text, image text)
language sql
stable
as $function$
  with base as (
    select g.id, g.name,
      coalesce(g.header_image, (select url from public.covers c where c.id = g.id)) as image,
      coalesce(g.reviews_total, 0) as rv,
      -- 대표 카테고리 1개: 장르 중 하나를 parent_category_of_one 로 매핑.
      (select public.parent_category_of_one(ge.name)
       from public.game_genres gg
       join public.genres ge on ge.id = gg.genre_id
       where gg.game_id = g.id
       order by (ge.name = '액션') desc, ge.name
       limit 1) as cat
    from public.games g
    where (g.first_release_date is null or g.first_release_date <= now())
      and coalesce(g.header_image, (select url from public.covers c where c.id = g.id)) is not null
  ),
  ranked as (
    -- 카테고리별 리뷰순 순위 → 라운드로빈(모든 1위 먼저, 그다음 2위 …)로 장르 균형
    select id, name, image, rv,
      row_number() over (partition by cat order by rv desc, id desc) as rnk
    from base
  )
  select id, name, image
  from ranked
  order by rnk asc, rv desc, id desc
  limit greatest(p_limit, 1);
$function$;
