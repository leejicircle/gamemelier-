-- =============================================================================
-- 취향 카드 공개 되돌리기
--
-- opt-in 을 켜는 길만 있고 끄는 길이 없었다(`mark_taste_card_shared()` 가 true 로만 씀).
-- 공개 범위를 좁히자고 넣은 장치인데 한 방향뿐이면 앞뒤가 안 맞는다.
--
--   1) set_taste_card_shared(boolean) — 켜기/끄기 겸용. mark_taste_card_shared 대체
--   2) get_taste_card 에 shared 추가 — 본인이 현재 공개 상태를 알아야 스위치를 그린다
--      (visible 은 본인이면 항상 true 라 공개 여부를 알 수 없다)
--
-- 주의: 끄더라도 카톡·X 가 이미 캐시한 미리보기는 회수되지 않는다. 링크를 새로 여는
-- 사람에게 비공개로 보이는 것까지가 효과다(어떤 구현이든 동일).
-- =============================================================================

create or replace function public.set_taste_card_shared(p_shared boolean)
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

  update public.profiles
     set taste_card_shared = coalesce(p_shared, false)
   where id = v_uid;
end
$function$;

revoke execute on function public.set_taste_card_shared(boolean) from public, anon;
grant  execute on function public.set_taste_card_shared(boolean) to authenticated, service_role;

-- 켜기 전용 함수는 역할이 겹치므로 제거.
drop function if exists public.mark_taste_card_shared();

-- 반환 컬럼(shared)이 추가되므로 DROP + CREATE.
drop function if exists public.get_taste_card(uuid);

create function public.get_taste_card(p_user uuid)
returns table(
  genres jsonb,
  tags jsonb,
  game_name text,
  game_image text,
  visible boolean,
  nickname text,
  -- 실제 공개 여부(원본 플래그). visible 과 달리 본인이어도 참이 되지 않는다.
  shared boolean
)
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
    -- 본인은 공유 전에도 자기 카드를 봐야 한다(공유하려면 먼저 봐야 하므로).
    -- 비로그인이면 auth.uid() 가 NULL 이고 `false or NULL` 은 NULL 이 되므로
    -- 비교식도 coalesce 로 감싼다(안 그러면 visible 이 false 가 아니라 NULL).
    select (select is_shared from flag)
           or coalesce(auth.uid() = p_user, false) as ok
  ),
  -- 정의를 get_taste_chips 와 일부러 똑같이 맞춘다(같은 화면에 나란히 놓이는데
  -- 1위 장르나 비중이 다르면 사용자에겐 그냥 틀린 숫자로 보인다).
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

revoke execute on function public.get_taste_card(uuid) from public;
grant  execute on function public.get_taste_card(uuid) to anon, authenticated, service_role;
