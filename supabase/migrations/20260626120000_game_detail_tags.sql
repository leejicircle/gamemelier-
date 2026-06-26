-- =============================================================================
-- 상세페이지 세부 태그 노출: get_game_detail 에 tags(투표수 상위 12) 추가
-- 적용: `supabase db push` 또는 MCP apply_migration.
-- 참고: SteamSpy 유저 태그(game_tags.votes). 장르(16개)보다 세밀한 취향 신호를 상세에 표시.
--
-- 반환 컬럼 추가라 RETURNS TABLE 변경 → DROP 후 재생성.
-- genres 바로 뒤에 tags 컬럼 추가. 본문은 기존과 동일 + tgs CTE 만 추가.
-- =============================================================================

drop function if exists public.get_game_detail(bigint, text, text, integer, integer);

create function public.get_game_detail(
  p_id bigint,
  p_currency_primary text default 'KRW',
  p_currency_fallback text default 'USD',
  p_limit_videos integer default 6,
  p_limit_screens integer default 12
)
returns table(
  id bigint, name text, summary text, header_image text,
  first_release_date timestamp with time zone, release_date_text text, reviews_total integer,
  price_currency text, price_final_cents integer, price_initial_cents integer, discount_percent integer,
  developers text[], publishers text[], genres text[], tags text[], categories text[], platforms text[],
  videos jsonb[], screenshots jsonb[],
  requirements_min_html text, requirements_rec_html text, is_saved boolean
)
language sql stable
as $$
  with base as (
    select g.id, g.name, g.summary,
      coalesce(c.url, g.header_image) as header_image,
      g.first_release_date, g.release_date_text, g.reviews_total
    from public.games g
    left join public.covers c on c.id = g.id
    where g.id = p_id
  ),
  picked_price as (
    select gp.*
    from public.game_prices gp
    where gp.game_id = p_id and gp.currency in (p_currency_primary, p_currency_fallback)
    order by (gp.currency = p_currency_primary) desc, gp.fetched_at desc
    limit 1
  ),
  devs as (
    select array_agg(d.name order by d.name) as arr
    from public.game_developers gd
    join public.developers d on d.id = gd.developer_id
    where gd.game_id = p_id
  ),
  pubs as (
    select array_agg(p.name order by p.name) as arr
    from public.game_publishers gp
    join public.publishers p on p.id = gp.publisher_id
    where gp.game_id = p_id
  ),
  gens as (
    select array_agg(vg.name order by vg.name) as arr
    from public.game_genres gg
    join public.v_genres_ko vg on vg.id = gg.genre_id
    where gg.game_id = p_id
  ),
  -- 세부 태그: SteamSpy 투표수 상위 12개 (꼬리표 과다 방지). votes 내림차순.
  tgs as (
    select array_agg(name order by votes desc) as arr
    from (
      select t.name, gt.votes
      from public.game_tags gt
      join public.tags t on t.id = gt.tag_id
      where gt.game_id = p_id
      order by gt.votes desc
      limit 12
    ) x
  ),
  cats as (
    select array_agg(c.name order by c.name) as arr
    from public.game_categories gc
    join public.categories c on c.id = gc.category_id
    where gc.game_id = p_id
  ),
  plats as (
    select array_agg(gp.platform_id order by gp.platform_id) as arr
    from public.game_platforms gp
    where gp.game_id = p_id
  ),
  vids as (
    select array_agg(
      jsonb_build_object('video_id', v.video_id, 'thumbnail', v.thumbnail, 'mp4_max', v.mp4_max)
      order by v.video_id
    ) as arr
    from (
      select video_id, thumbnail, mp4_max
      from public.game_videos where game_id = p_id
      order by video_id limit p_limit_videos
    ) v
  ),
  scrs as (
    select array_agg(
      jsonb_build_object('url_full', s.url_full, 'url_thumb', s.url_thumb)
      order by s.shot_id
    ) as arr
    from (
      select shot_id, url_full, url_thumb
      from public.game_screenshots where game_id = p_id
      order by shot_id limit p_limit_screens
    ) s
  ),
  reqs as (
    select r.minimum_html as min_html, r.recommended_html as rec_html
    from public.game_requirements r where r.game_id = p_id
  ),
  saved as (
    select exists (
      select 1 from public.user_saved_games usg
      where usg.user_id = auth.uid() and usg.game_id = p_id
    ) as flag
  )
  select
    b.id, b.name, b.summary, b.header_image,
    b.first_release_date, b.release_date_text, b.reviews_total,
    pp.currency, pp.final_cents, pp.initial_cents, pp.discount_percent,
    coalesce(d.arr, array[]::text[]),
    coalesce(p.arr, array[]::text[]),
    coalesce(g.arr, array[]::text[]),
    coalesce(tg.arr, array[]::text[]),
    coalesce(ca.arr, array[]::text[]),
    coalesce(pl.arr, array[]::text[]),
    coalesce(v.arr, array[]::jsonb[]),
    coalesce(s.arr, array[]::jsonb[]),
    rq.min_html, rq.rec_html,
    coalesce(sd.flag, false)
  from base b
  left join picked_price pp on true
  left join devs d   on true
  left join pubs p   on true
  left join gens g   on true
  left join tgs tg   on true
  left join cats ca  on true
  left join plats pl on true
  left join vids v   on true
  left join scrs s   on true
  left join reqs rq  on true
  left join saved sd on true
$$;
