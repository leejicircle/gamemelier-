-- 취향 축이 아닌 장르·태그를 추천 점수에서 제외한다.
--
-- 무료 플레이·앞서 해보기는 가격 모델과 개발 단계이고 대규모 멀티플레이어는 플레이 방식이라
-- 게임의 성격을 가르지 못한다. 태그에 쓰는 idf(흔할수록 비중을 낮춤)로는 안 걸러진다.
-- 무료 플레이는 전체 1,972건 중 251건(12.7%)이라 오히려 드문 축으로 잡혀 비중이 올라간다.
--
-- 목록을 코드가 아니라 데이터에 둔다. 나중에 항목을 더 빼거나 되돌릴 때 update 한 줄이면 된다.

alter table public.genres add column if not exists is_taste_axis boolean not null default true;
alter table public.tags   add column if not exists is_taste_axis boolean not null default true;

update public.genres set is_taste_axis = false
where name in ('무료 플레이', '앞서 해보기', '대규모 멀티플레이어');

update public.tags set is_taste_axis = false
where name in ('Indie', 'Early Access', 'Controller', 'Massively Multiplayer', 'Free to Play');


-- 메인 추천: 취향 수집분에서 제외 항목을 걸러낸다.
-- fav_genre / fav_tag 는 점수(genre_score·tag_score)와 이유 배지(top_genre·top_tag) 양쪽이
-- 참조하므로 여기서 한 번 거르면 '취향 장르 · 무료 플레이' 같은 배지도 같이 사라진다.
create or replace function public.recommend_games_cards(
  p_user uuid,
  p_budget_cents integer default null::integer,
  p_limit integer default 30,
  p_exclude_upcoming boolean default true
)
returns table(id bigint, name text, image text, reason text, reason_kind text)
language sql
stable
as $function$
  with
  fav_genre as (
    select p.genre_id, p.weight
    from public.user_genre_preferences p
    join public.genres g on g.id = p.genre_id
    where p.user_id = p_user and g.is_taste_axis
    union all
    select g.id, 1.0
    from public.profiles pf
    join lateral unnest(coalesce(pf.favorite_genres, '{}')) fn(name) on true
    join public.genres g on lower(g.name) = lower(fn.name)
    where pf.id = p_user and g.is_taste_axis
  ),
  fav_tag as (
    select p.tag_id, p.weight
    from public.user_tag_preferences p
    join public.tags t on t.id = p.tag_id
    where p.user_id = p_user and t.is_taste_axis
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
        when s.top_tag is not null and s.tag_score >= 0.5 then 'tag'
        when s.top_genre is not null and s.genre_score >= 0.5 then 'genre'
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
    ( least(r.genre_score, 4.0) * 4
    + least(r.tag_score, 8.0) * 6
    + r.quality * 50
    + r.recency * 0.3
    + r.discount_percent * 0.4
    ) desc,
    r.first_release_date desc nulls last,
    r.id desc
  limit greatest(p_limit, 1);
$function$;


-- 선반 B(최근 저장 기반 유사작): 장르 교집합으로 유사도를 재기 때문에 같은 문제가 있다.
-- 앵커가 무료 플레이면 다른 무료 플레이 게임이 전부 비슷하다고 잡힌다.
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
    join public.genres g on g.id = gg.genre_id and g.is_taste_axis
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
             + (select count(*) from public.game_genres g2
                join public.genres gx on gx.id = g2.genre_id and gx.is_taste_axis
                where g2.game_id = c.game_id)
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
