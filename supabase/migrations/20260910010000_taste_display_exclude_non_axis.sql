-- 취향 칩·취향 카드에서도 취향 축이 아닌 장르·태그를 뺀다.
--
-- 앞선 마이그레이션(20260909120000)은 추천 점수에서만 뺐다. 화면에 "내 취향"을
-- 보여주는 두 함수는 user_genre_preferences / user_tag_preferences 를 그대로 읽어서
-- 여전히 무료 플레이가 20% 로 떴다. 무료 플레이를 처음 발견한 자리가 이 화면이라
-- 여기까지 걸러야 문제가 없어진다.

create or replace function public.get_taste_chips(p_user uuid, p_limit integer default 3)
returns table(genre_id bigint, name text, weight numeric, share numeric)
language sql
stable
as $function$
  with prefs as (
    select ugp.genre_id, ugp.weight, g.name
    from public.user_genre_preferences ugp
    join public.genres g on g.id = ugp.genre_id
    where ugp.user_id = p_user and ugp.weight > 0 and g.is_taste_axis
  ),
  tot as (select nullif(sum(weight), 0) as s from prefs)
  select p.genre_id, p.name, p.weight,
         round((p.weight / (select s from tot))::numeric, 4) as share
  from prefs p
  order by p.weight desc, p.name
  limit greatest(p_limit, 1);
$function$;

create or replace function public.get_taste_card(p_user uuid)
returns table(genres jsonb, tags jsonb, game_name text, game_image text, visible boolean, nickname text, shared boolean)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with flag as (
    select coalesce(
             (select pf.taste_card_shared from public.profiles pf where pf.id = p_user),
             false
           ) as is_shared
  ),
  vis as (
    select (select is_shared from flag)
           or coalesce(auth.uid() = p_user, false) as ok
  ),
  genre_pref as (
    select g.name, ugp.weight
    from public.user_genre_preferences ugp
    join public.genres g on g.id = ugp.genre_id
    where ugp.user_id = p_user and ugp.weight > 0 and g.is_taste_axis
      and (select ok from vis)
  ),
  genre_top as (
    select name, weight from genre_pref order by weight desc, name limit 3
  ),
  tag_top as (
    select t.name, utp.weight
    from public.user_tag_preferences utp
    join public.tags t on t.id = utp.tag_id
    where utp.user_id = p_user and utp.weight > 0 and t.is_taste_axis
      and (select ok from vis)
    order by utp.weight desc, t.name
    limit 3
  ),
  anchor as (
    select g.name,
           coalesce(g.header_image, (select url from public.covers c where c.id = g.id)) as image
    from public.user_saved_games usg
    join public.games g on g.id = usg.game_id
    where usg.user_id = p_user
      and (select ok from vis)
    order by usg.saved_at desc
    limit 1
  )
  select
    (select jsonb_agg(
       jsonb_build_object(
         'name', gt.name,
         'share', round((gt.weight / nullif((select sum(weight) from genre_pref), 0))::numeric, 4)
       ) order by gt.weight desc, gt.name)
     from genre_top gt),
    (select jsonb_agg(tt.name order by tt.weight desc, tt.name) from tag_top tt),
    (select a.name from anchor a),
    (select a.image from anchor a),
    (select ok from vis),
    (select pf.nickname from public.profiles pf
      where pf.id = p_user and (select ok from vis)),
    (select is_shared from flag);
$function$;
