-- =============================================================================
-- 추천 스코어링 재균형: 러프한 장르 과대가중 완화 + 세밀한 태그 우대
-- 적용: `supabase db push` 또는 MCP apply_migration (prod 적용됨).
--
-- 변경은 recommend_games_cards 의 ORDER BY 상수뿐(본문/시그니처 동일 → CREATE OR REPLACE).
--   - genre_score: ×6 무상한 → ×4 + 상한 4 (다장르 게임 독식 차단)
--   - tag_score  : ×4 → ×6 (상한 8 유지) (세밀 신호 우대)
--   - quality/recency/discount 앵커 그대로
-- 배경: 장르(16개)는 스팀의 큰 바구니라 변별력이 약한데(거의 다 액션 등) ×6 무상한으로
--   quality 보다 커질 수 있었고, 세밀한 태그(379개, "Action RPG"vs"Strategy RPG")는
--   8로 깎이고 ×4 라 눌려 있었다. 취향 태그 있는 유저의 세밀 취향이 랭킹에 반영되도록 조정.
-- 주의: 트래픽 0(측정 불가)이라 보수적으로. 태그 취향 없는 유저는 tag_score=0 이라 영향 미미.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.recommend_games_cards(p_user uuid, p_budget_cents integer DEFAULT NULL::integer, p_limit integer DEFAULT 30, p_exclude_upcoming boolean DEFAULT true)
 RETURNS TABLE(id bigint, name text, image text, reason text, reason_kind text)
 LANGUAGE sql
 STABLE
AS $function$
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
        -- 재균형(태그 우대)에 맞춰 이유 배지도 태그 우선. 태그 매칭 없을 때만 장르.
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
    -- 재균형: 러프한 장르(상한4·×4) < 세밀한 태그(상한8·×6). quality 앵커 유지.
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
