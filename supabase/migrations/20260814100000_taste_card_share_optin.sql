-- =============================================================================
-- 취향 카드 공개 범위: 공유한 유저만
--
-- 그 전에는 uuid 만 알면 공유하지 않은 유저의 카드도 열렸다. 노출 항목이 장르·태그·
-- 최근 저장 게임뿐이라 민감도는 낮지만, "공유한 적 없는데 열린다"는 건 사용자가
-- 기대하는 동작이 아니다. 공유 버튼을 누른 유저만 공개로 전환한다.
--
--   1) profiles.taste_card_shared — 공개 여부(기본 false)
--   2) get_taste_card 재정의 — 공개 아니면 빈 카드 + visible=false
--   3) mark_taste_card_shared — 공유 시 본인 것만 true 로
-- =============================================================================

alter table public.profiles
  add column if not exists taste_card_shared boolean not null default false;

-- 반환 컬럼(visible)이 추가되므로 DROP + CREATE.
drop function if exists public.get_taste_card(uuid);

create function public.get_taste_card(p_user uuid)
returns table(
  genres jsonb,
  tags jsonb,
  game_name text,
  game_image text,
  visible boolean,
  -- 카드 주인 닉네임("test6님은 ..."). 공유 링크로 들어온 사람에겐 "당신은" 이 틀린
  -- 말이라 필요하다. 공개(visible) 카드일 때만 나간다.
  nickname text
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with vis as (
    -- 본인은 공유 전에도 자기 카드를 봐야 한다(공유하려면 먼저 봐야 하므로).
    -- DEFINER 함수 안에서도 auth.uid() 는 호출자의 JWT 를 그대로 읽는다.
    -- 비로그인이면 auth.uid() 가 NULL 이고 `false or NULL` 은 NULL 이 되므로
    -- 비교식도 coalesce 로 감싼다(안 그러면 visible 이 false 가 아니라 NULL).
    select coalesce(
             (select pf.taste_card_shared from public.profiles pf where pf.id = p_user),
             false
           ) or coalesce(auth.uid() = p_user, false) as ok
  ),
  -- 정의를 get_taste_chips 와 일부러 똑같이 맞춘다(같은 화면에 나란히 놓이는데
  -- 1위 장르나 비중이 다르면 사용자에겐 그냥 틀린 숫자로 보인다).
  -- 그래서 가입 장르(profiles.favorite_genres)는 섞지 않고 행동 취향만 쓴다.
  genre_pref as (
    select g.name, ugp.weight
    from public.user_genre_preferences ugp
    join public.genres g on g.id = ugp.genre_id
    where ugp.user_id = p_user and ugp.weight > 0
      and (select ok from vis)
  ),
  genre_top as (
    select name, weight from genre_pref order by weight desc, name limit 3
  ),
  tag_top as (
    select t.name, utp.weight
    from public.user_tag_preferences utp
    join public.tags t on t.id = utp.tag_id
    where utp.user_id = p_user and utp.weight > 0
      and (select ok from vis)
    order by utp.weight desc, t.name
    limit 3
  ),
  anchor as (
    -- 카드 배경 아트 = 가장 최근 저장한 게임(recommend_from_recent_save 와 같은 기준)
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
    -- share 분모는 상위 3개가 아니라 "전체 장르 합" (get_taste_chips 와 동일 정의)
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
      where pf.id = p_user and (select ok from vis));
$function$;

revoke execute on function public.get_taste_card(uuid) from public;
grant  execute on function public.get_taste_card(uuid) to anon, authenticated, service_role;

-- 공유 버튼을 누르면 본인 카드를 공개로 전환. 쓰기라 anon 차단.
create or replace function public.mark_taste_card_shared()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'unauthorized';
  end if;

  update public.profiles set taste_card_shared = true where id = v_uid;
end
$function$;

revoke execute on function public.mark_taste_card_shared() from public, anon;
grant  execute on function public.mark_taste_card_shared() to authenticated, service_role;
