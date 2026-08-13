-- =============================================================================
-- 취향 프로필 공유 카드: 공개 요약 조회
--
-- get_taste_card — 유저 1명의 취향 요약(상위 장르 3 + 상위 태그 3 + 최근 저장 게임)
--
-- 왜 SECURITY DEFINER 인가: 공유 링크의 OG 이미지는 비로그인 크롤러(카카오·X 등)가
-- 가져간다. get_taste_chips 는 INVOKER+RLS 라 크롤러에겐 항상 빈 결과 → 카드가
-- 못 만들어진다. 그래서 "요약만" 돌려주는 전용 DEFINER 함수를 따로 둔다.
-- 노출 범위는 장르명·비중·태그명·최근 저장 게임 1개뿐이고 이메일·닉네임·저장 목록은
-- 반환하지 않는다. 링크(=uuid)를 아는 사람만 볼 수 있다.
-- =============================================================================

create or replace function public.get_taste_card(p_user uuid)
returns table(genres jsonb, tags jsonb, game_name text, game_image text)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with genre_pref as (
    -- 행동으로 쌓인 취향
    select g.name, ugp.weight
    from public.user_genre_preferences ugp
    join public.genres g on g.id = ugp.genre_id
    where ugp.user_id = p_user and ugp.weight > 0
    union all
    -- 가입 시 고른 장르(행동 신호가 아직 없는 유저도 카드가 비지 않게) —
    -- recommend_games_cards 의 fav_genre 패턴과 동일
    select g.name, 1.0
    from public.profiles pf
    join lateral unnest(coalesce(pf.favorite_genres, '{}')) fn(name) on true
    join public.genres g on lower(g.name) = lower(fn.name)
    where pf.id = p_user
  ),
  genre_sum as (
    -- 두 출처에 같은 장르가 있으면 합산(중복 칩 방지)
    select name, sum(weight) as weight from genre_pref group by name
  ),
  genre_top as (
    select name, weight from genre_sum order by weight desc, name limit 3
  ),
  tag_top as (
    select t.name, utp.weight
    from public.user_tag_preferences utp
    join public.tags t on t.id = utp.tag_id
    where utp.user_id = p_user and utp.weight > 0
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
    order by usg.saved_at desc
    limit 1
  )
  select
    -- share 분모는 상위 3개가 아니라 "전체 장르 합" (get_taste_chips 와 동일 정의)
    (select jsonb_agg(
       jsonb_build_object(
         'name', gt.name,
         'share', round((gt.weight / nullif((select sum(weight) from genre_sum), 0))::numeric, 4)
       ) order by gt.weight desc, gt.name)
     from genre_top gt),
    (select jsonb_agg(tt.name order by tt.weight desc, tt.name) from tag_top tt),
    (select a.name from anchor a),
    (select a.image from anchor a);
$function$;

-- 읽기 전용 요약이라 비로그인(anon)도 허용해야 크롤러가 OG 이미지를 만들 수 있다.
revoke execute on function public.get_taste_card(uuid) from public;
grant  execute on function public.get_taste_card(uuid) to anon, authenticated, service_role;
