-- =============================================================================
-- v3 온보딩 게임 픽커: 취향 시드 + 픽커용 인기작 목록
-- 적용: MCP apply_migration 또는 `supabase db push` / SQL Editor.
--   (작성 시점 Supabase MCP 일시 불응 → prod 적용 후 파일명을 이력 version 에 맞출 것)
-- 참고: docs/personalization-plan.md 6.4(온보딩 게임 픽커)
--
--   1) seed_taste_from_games — 고른 게임들의 장르/태그로 취향 시드
--      (set_signup_genres 패턴 미러: SECURITY DEFINER + auth.uid())
--   2) list_picker_games — 픽커 그리드용 인기작(리뷰 많은 순)
-- =============================================================================

create or replace function public.seed_taste_from_games(p_game_ids bigint[])
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
  if p_game_ids is null or array_length(p_game_ids, 1) is null then
    return;
  end if;

  -- 장르 시드: 고른 게임들에 등장한 횟수 × 0.5 (상한 3.0).
  -- 명시 신호("재밌게 했다")라 저장(+0.25)보다 강하게. group by 로 행 중복 충돌 방지.
  insert into public.user_genre_preferences (user_id, genre_id, weight)
  select v_uid, gg.genre_id, least(count(*) * 0.5, 3.0)
  from public.game_genres gg
  where gg.game_id = any(p_game_ids)
  group by gg.genre_id
  on conflict (user_id, genre_id) do update
    set weight = least(user_genre_preferences.weight + excluded.weight, 3.0);

  -- 태그 시드: 동일 방식
  insert into public.user_tag_preferences (user_id, tag_id, weight)
  select v_uid, gt.tag_id, least(count(*) * 0.5, 3.0)
  from public.game_tags gt
  where gt.game_id = any(p_game_ids)
  group by gt.tag_id
  on conflict (user_id, tag_id) do update
    set weight = least(user_tag_preferences.weight + excluded.weight, 3.0);
end
$function$;

create or replace function public.list_picker_games(p_limit integer default 24)
returns table(id bigint, name text, image text)
language sql
stable
as $function$
  select g.id, g.name,
         coalesce(g.header_image, (select url from public.covers c where c.id = g.id)) as image
  from public.games g
  where (g.first_release_date is null or g.first_release_date <= now())
    and coalesce(g.header_image, (select url from public.covers c where c.id = g.id)) is not null
  order by coalesce(g.reviews_total, 0) desc, g.id desc
  limit greatest(p_limit, 1);
$function$;
