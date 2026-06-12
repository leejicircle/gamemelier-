


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."browse_games_by_genres_cards"("p_genre_ids" bigint[] DEFAULT NULL::bigint[], "p_order" "text" DEFAULT 'updated'::"text", "p_limit" integer DEFAULT 30, "p_offset" integer DEFAULT 0) RETURNS TABLE("id" bigint, "name" "text", "image" "text", "total_count" integer)
    LANGUAGE "sql" STABLE
    AS $$
  with base as (
    select
      g.id,
      g.name,
      coalesce(g.header_image, (select url from public.covers c where c.id = g.id)) as image,
      g.metacritic_score,
      g.reviews_total,
      g.first_release_date,
      g.updated_at,
      coalesce(g.first_release_date, public.try_timestamptz(g.release_date_text)) as release_at,
      coalesce(g.metacritic_score, 0) + ln(greatest(g.reviews_total, 1)) * 10 as popularity_score
    from public.games g
    where (
      p_genre_ids is null
      or cardinality(p_genre_ids) = 0
      or exists (
        select 1 from public.game_genres gg
        where gg.game_id = g.id and gg.genre_id = any(p_genre_ids)
      )
    )
  ),
  filtered as (
    select * from base
    where release_at is null or release_at <= now()   -- 출시예정 제외
  ),
  ranked as (
    select
      *,
      count(*) over() as total_count,
      row_number() over (
        order by
          case when p_order = 'updated' then updated_at end desc nulls last,
          case when p_order = 'recent'  then release_at end desc nulls last,
          case when p_order = 'mc'      then metacritic_score end desc nulls last,
          case when p_order = 'popular' then popularity_score end desc nulls last,
          id desc
      ) as rn
    from filtered
  )
  select id, name, image, total_count
  from ranked
  where rn > p_offset
  order by rn
  limit p_limit;
$$;


ALTER FUNCTION "public"."browse_games_by_genres_cards"("p_genre_ids" bigint[], "p_order" "text", "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bump_weight_on_save"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if (tg_op = 'INSERT') then
    insert into public.user_genre_preferences(user_id, genre_id, weight)
    select new.user_id, gg.genre_id, 0.25
    from public.game_genres gg where gg.game_id = new.game_id
    on conflict (user_id, genre_id) do update
      set weight = least(user_genre_preferences.weight + 0.25, 3.0);

    insert into public.user_tag_preferences(user_id, tag_id, weight)
    select new.user_id, gt.tag_id, 0.25
    from public.game_tags gt where gt.game_id = new.game_id
    on conflict (user_id, tag_id) do update
      set weight = least(user_tag_preferences.weight + 0.25, 3.0);
    return new;

  elsif (tg_op = 'DELETE') then
    update public.user_genre_preferences ugp
    set weight = greatest(ugp.weight - 0.15, 0.0)
    from public.game_genres gg
    where ugp.user_id = old.user_id and gg.game_id = old.game_id and ugp.genre_id = gg.genre_id;

    update public.user_tag_preferences utp
    set weight = greatest(utp.weight - 0.15, 0.0)
    from public.game_tags gt
    where utp.user_id = old.user_id and gt.game_id = old.game_id and utp.tag_id = gt.tag_id;
    return old;
  end if;
  return null;
end
$$;


ALTER FUNCTION "public"."bump_weight_on_save"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."contains_any"("raw" "text", "arr" "text"[]) RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select exists (
    select 1
    from unnest(arr) k
    where position(norm_text(k) in norm_text(raw)) > 0
  );
$$;


ALTER FUNCTION "public"."contains_any"("raw" "text", "arr" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_game_detail"("p_id" bigint, "p_currency_primary" "text" DEFAULT 'KRW'::"text", "p_currency_fallback" "text" DEFAULT 'USD'::"text", "p_limit_videos" integer DEFAULT 6, "p_limit_screens" integer DEFAULT 12) RETURNS TABLE("id" bigint, "name" "text", "summary" "text", "header_image" "text", "first_release_date" timestamp with time zone, "release_date_text" "text", "reviews_total" integer, "price_currency" "text", "price_final_cents" integer, "price_initial_cents" integer, "discount_percent" integer, "developers" "text"[], "publishers" "text"[], "genres" "text"[], "categories" "text"[], "platforms" "text"[], "videos" "jsonb"[], "screenshots" "jsonb"[], "requirements_min_html" "text", "requirements_rec_html" "text", "is_saved" boolean)
    LANGUAGE "sql" STABLE
    AS $$
  with base as (
    select
      g.id,
      g.name,
      g.summary,
      -- covers.url 있으면 그걸 우선, 없으면 header_image
      coalesce(c.url, g.header_image) as header_image,
      g.first_release_date,
      g.release_date_text,
      g.reviews_total
    from public.games g
    left join public.covers c on c.id = g.id
    where g.id = p_id
  ),
  picked_price as (
    select gp.*
    from public.game_prices gp
    where gp.game_id = p_id
      and gp.currency in (p_currency_primary, p_currency_fallback)
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
      jsonb_build_object(
        'video_id', v.video_id,
        'thumbnail', v.thumbnail,
        'mp4_max',   v.mp4_max
      )
      order by v.video_id
    ) as arr
    from (
      select video_id, thumbnail, mp4_max
      from public.game_videos
      where game_id = p_id
      order by video_id
      limit p_limit_videos
    ) v
  ),
  scrs as (
    select array_agg(
      jsonb_build_object(
        'url_full',  s.url_full,
        'url_thumb', s.url_thumb
      )
      order by s.shot_id
    ) as arr
    from (
      select shot_id, url_full, url_thumb
      from public.game_screenshots
      where game_id = p_id
      order by shot_id
      limit p_limit_screens
    ) s
  ),
  reqs as (
    select
      r.minimum_html     as min_html,
      r.recommended_html as rec_html
    from public.game_requirements r
    where r.game_id = p_id
  ),
  saved as (
    select exists (
      select 1
      from public.user_saved_games usg
      where usg.user_id = auth.uid()
        and usg.game_id = p_id
    ) as flag
  )
  select
    b.id,
    b.name,
    b.summary,
    b.header_image,
    b.first_release_date,
    b.release_date_text,
    b.reviews_total,

    pp.currency,
    pp.final_cents,
    pp.initial_cents,
    pp.discount_percent,

    coalesce(d.arr, array[]::text[]),
    coalesce(p.arr, array[]::text[]),
    coalesce(g.arr, array[]::text[]),
    coalesce(ca.arr, array[]::text[]),
    coalesce(pl.arr, array[]::text[]),

    coalesce(v.arr, array[]::jsonb[]),
    coalesce(s.arr, array[]::jsonb[]),

    rq.min_html,
    rq.rec_html,

    coalesce(sd.flag, false)
  from base b
  left join picked_price pp on true
  left join devs d   on true
  left join pubs p   on true
  left join gens g   on true
  left join cats ca  on true
  left join plats pl on true
  left join vids v   on true
  left join scrs s   on true
  left join reqs rq  on true
  left join saved sd on true
$$;


ALTER FUNCTION "public"."get_game_detail"("p_id" bigint, "p_currency_primary" "text", "p_currency_fallback" "text", "p_limit_videos" integer, "p_limit_screens" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_games_cards_by_ids"("p_ids" bigint[], "p_allow_categories" "text"[] DEFAULT NULL::"text"[]) RETURNS TABLE("id" bigint, "name" "text", "image" "text", "category" "text")
    LANGUAGE "sql" STABLE
    AS $$
  with ids as (
    select id::bigint, ord::int
    from unnest(p_ids) with ordinality as t(id, ord)
  ),
  cats as (
    select gg.game_id,
           array_agg(distinct public.parent_category_of_one(ge.name)) as cats
    from public.game_genres gg
    join public.genres ge on ge.id = gg.genre_id
    where gg.game_id = any(p_ids)
    group by gg.game_id
  ),
  cats_norm as (
    select
      game_id,
      (
        select array_agg(distinct y)
        from (
          select case
                   when x in ('스포츠','레이싱') then '스포츠·레이싱'
                   else x
                 end as y
          from unnest(coalesce(cats, array['기타'])) as t(x)
        ) s
      ) as cats
    from cats
  )
  select
    i.id,
    g.name,
    coalesce(g.header_image, c.url) as image,
    (
      select cat
      from unnest(array['액션','RPG','전략','어드벤처','시뮬레이션','스포츠·레이싱','기타']) cat
      where (coalesce(cn.cats, array['기타']) @> array[cat])
        and (p_allow_categories is null or cat = any(p_allow_categories))
      limit 1
    ) as category
  from ids i
  join public.games g on g.id = i.id
  left join public.covers c on c.id = g.id
  left join cats_norm cn on cn.game_id = g.id
  where p_allow_categories is null
     or exists (
          select 1
          from unnest(coalesce(cn.cats, array['기타'])) x
          where x = any(p_allow_categories)
        )
  order by i.ord;
$$;


ALTER FUNCTION "public"."get_games_cards_by_ids"("p_ids" bigint[], "p_allow_categories" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_games_cards"("p_genre_ids" integer[] DEFAULT NULL::integer[], "p_allow_categories" "text"[] DEFAULT NULL::"text"[], "p_limit" integer DEFAULT 15, "p_offset" integer DEFAULT 0) RETURNS TABLE("id" bigint, "name" "text", "image" "text", "category" "text", "total_count" bigint)
    LANGUAGE "sql" STABLE
    AS $$
  with base as (
    select g.id, g.name, coalesce(g.header_image, c.url) as image
    from public.games g
    left join public.covers c on c.id = g.id
    where (
      p_genre_ids is null
      or exists (
        select 1 from public.game_genres gg
        where gg.game_id = g.id
          and gg.genre_id = any(p_genre_ids)
      )
    )
  ),
  cats as (
    select gg.game_id,
           array_agg(distinct public.parent_category_of_one(ge.name)) as cats
    from public.game_genres gg
    join public.genres ge on ge.id = gg.genre_id
    where gg.game_id in (select id from base)
    group by gg.game_id
  ),
  -- 핵심: 스포츠/레이싱 → 스포츠·레이싱으로 정규화
  cats_norm as (
    select
      game_id,
      (
        select array_agg(distinct y)
        from (
          select case
                   when x in ('스포츠','레이싱') then '스포츠·레이싱'
                   else x
                 end as y
          from unnest(coalesce(cats, array['기타'])) as t(x)
        ) s
      ) as cats
    from cats
  ),
  ranked as (
    select
      b.id,
      b.name,
      b.image,
      (
        select cat
        from unnest(array['액션','RPG','전략','어드벤처','시뮬레이션','스포츠·레이싱','기타']) cat
        where (coalesce(cn.cats, array['기타']) @> array[cat])
          and (p_allow_categories is null or cat = any(p_allow_categories))
        limit 1
      ) as category
    from base b
    left join cats_norm cn on cn.game_id = b.id
  ),
  with_total as (
    select r.*, count(*) over() as total_count
    from ranked r
    where p_allow_categories is null
       or exists (
            select 1
            from unnest(
              coalesce((select cats from cats_norm where game_id = r.id), array['기타'])
            ) x
            where x = any(p_allow_categories)
          )
    order by r.id desc
    limit greatest(p_limit, 1)
    offset greatest(p_offset, 0)
  )
  select * from with_total;
$$;


ALTER FUNCTION "public"."list_games_cards"("p_genre_ids" integer[], "p_allow_categories" "text"[], "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_saved_on_sale"("p_limit" integer DEFAULT 6) RETURNS TABLE("id" bigint, "name" "text", "image" "text", "discount_percent" integer, "initial_cents" bigint, "final_cents" bigint, "currency" "text", "saved_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select t.id, t.name, t.image, t.discount_percent,
         t.initial_cents, t.final_cents, t.currency, t.saved_at
  from (
    select distinct on (s.game_id)
           g.id,
           g.name,
           g.header_image as image,
           p.discount_percent,
           p.initial_cents::bigint,
           p.final_cents::bigint,
           p.currency,
           s.saved_at
    from user_saved_games s
    join games g        on g.id = s.game_id
    join game_prices p  on p.game_id = s.game_id
    where s.user_id = auth.uid()
      and coalesce(p.discount_percent, 0) > 0
    order by s.game_id, (p.currency = 'KRW') desc
  ) t
  order by t.discount_percent desc, t.saved_at desc
  limit p_limit;
$$;


ALTER FUNCTION "public"."list_saved_on_sale"("p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_similar_games"("p_game_id" bigint, "p_limit" integer DEFAULT 10) RETURNS TABLE("id" bigint, "name" "text", "image" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with base as (
    select genre_id
    from game_genres
    where game_id = p_game_id
  ),
  cand as (
    -- 기준 게임과 장르가 1개 이상 겹치는 후보 + 교집합 크기
    select gg.game_id, count(*)::numeric as inter
    from game_genres gg
    join base b on b.genre_id = gg.genre_id
    where gg.game_id <> p_game_id
    group by gg.game_id
  ),
  scored as (
    -- 자카드 = 교집합 / 합집합
    select c.game_id,
           c.inter / (
             (select count(*) from base)
             + (select count(*) from game_genres g2 where g2.game_id = c.game_id)
             - c.inter
           ) as jaccard
    from cand c
  )
  select g.id, g.name, g.header_image as image
  from scored sc
  join games g on g.id = sc.game_id
  order by sc.jaccard desc, coalesce(g.reviews_total, 0) desc
  limit p_limit;
$$;


ALTER FUNCTION "public"."list_similar_games"("p_game_id" bigint, "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_upcoming_games_cards"("p_limit" integer DEFAULT 30, "p_offset" integer DEFAULT 0) RETURNS TABLE("id" bigint, "name" "text", "image" "text", "release_at" timestamp with time zone, "release_date_text" "text", "total_count" integer)
    LANGUAGE "sql" STABLE
    AS $$
  with base as (
    select
      g.id,
      g.name,
      coalesce(g.header_image, (select url from public.covers c where c.id = g.id)) as image,
      coalesce(g.first_release_date, public.try_timestamptz(g.release_date_text)) as release_at,
      g.release_date_text
    from public.games g
  ),
  filtered as (
    select * from base
    where release_at is not null and release_at > now()
  ),
  ranked as (
    select
      *,
      count(*) over() as total_count,
      row_number() over (order by release_at asc, id asc) as rn
    from filtered
  )
  select id, name, image, release_at, release_date_text, total_count
  from ranked
  where rn > p_offset
  order by rn
  limit p_limit;
$$;


ALTER FUNCTION "public"."list_upcoming_games_cards"("p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."norm_text"("t" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select lower(regexp_replace(coalesce(t,''), '\s+', ' ', 'g'));
$$;


ALTER FUNCTION "public"."norm_text"("t" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."parent_category_of_one"("raw" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select coalesce((
    case
      -- 액션
      when public.contains_any(raw, array[
        'action','action adventure','action-adventure','beat em up','beat ''em up',
        '핵앤슬래시','핵 앤 슬래시','액션','액션 어드벤처'
      ]) then '액션'

      -- RPG
      when public.contains_any(raw, array[
        'rpg','jrpg','arpg','action rpg','role-playing','role playing',
        '롤플레잉','롤 플레이','롤플레잉 게임'
      ]) then 'RPG'

      -- 전략
      when public.contains_any(raw, array[
        'strategy','rts','real time strategy','turn based strategy','4x',
        '실시간 전략','턴제 전략','전략'
      ]) then '전략'

      -- 어드벤처
      when public.contains_any(raw, array[
        'adventure','story rich','visual novel','puzzle',
        '어드벤처','어드벤쳐','스토리 중심','비주얼 노벨','퍼즐'
      ]) then '어드벤처'

      -- 시뮬레이션
      when public.contains_any(raw, array[
        'simulation','management','city builder','life sim',
        '시뮬레이션','경영','관리','도시 건설','라이프 심'
      ]) then '시뮬레이션'

      -- 스포츠·레이싱
      when public.contains_any(raw, array[
        'sports','racing','축구','농구','야구','골프','스포츠','레이싱','카레이싱'
      ]) then '스포츠·레이싱'

      else '기타'
    end
  ), '기타');
$$;


ALTER FUNCTION "public"."parent_category_of_one"("raw" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."parse_korean_date"("s" "text") RETURNS timestamp with time zone
    LANGUAGE "plpgsql" IMMUTABLE
    AS $_$
declare
  y int;
  m int;
  d int;
  cleaned text;
  month_end date;
  matches text[];
begin
  if s is null then
    return null;
  end if;

  cleaned := regexp_replace(s, '\s+', ' ', 'g');

  -- 1) YYYY년 M월 D일
  if cleaned ~ '^\s*\d{4}년 \d{1,2}월 \d{1,2}일\s*$' then
    matches := regexp_match(cleaned, '(\d{4})년 (\d{1,2})월 (\d{1,2})일');
    if matches is not null then
      y := matches[1]::int;
      m := matches[2]::int;
      d := matches[3]::int;
      return make_timestamptz(y, m, d, 0, 0, 0, 'Asia/Seoul');
    end if;
  end if;

  -- 2) YYYY년 M월 (일자 없음 → 말일)
  if cleaned ~ '^\s*\d{4}년 \d{1,2}월\s*$' then
    matches := regexp_match(cleaned, '(\d{4})년 (\d{1,2})월');
    if matches is not null then
      y := matches[1]::int;
      m := matches[2]::int;
      month_end := (date_trunc('month', make_date(y, m, 1)) + interval '1 month - 1 day')::date;
      return month_end::timestamptz;
    end if;
  end if;

  -- 3) YYYY년 (달/일 없음 → 12월 31일)
  if cleaned ~ '^\s*\d{4}년\s*$' then
    matches := regexp_match(cleaned, '(\d{4})년');
    if matches is not null then
      y := matches[1]::int;
      return make_timestamptz(y, 12, 31, 0, 0, 0, 'Asia/Seoul');
    end if;
  end if;

  return null;
end;
$_$;


ALTER FUNCTION "public"."parse_korean_date"("s" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recommend_games"("p_user" "uuid", "p_budget_cents" integer DEFAULT NULL::integer, "p_limit" integer DEFAULT 50) RETURNS TABLE("id" bigint, "name" "text", "metacritic_score" integer, "reviews_total" integer, "price_cents" integer, "cover_url" "text")
    LANGUAGE "sql" STABLE
    AS $$
  with fav as (
    -- 정규화 선호(가중치)
    select user_id, genre_id, weight
    from public.user_genre_preferences
    where user_id = p_user
    union all
    -- 프로필 배열 선호를 weight=1.0으로 추가
    select pf.id, g.id, 1.0
    from public.profiles pf
    join lateral unnest(coalesce(pf.favorite_genres, '{}')) fn(name) on true
    join public.genres g on lower(g.name) = lower(fn.name)
    where pf.id = p_user
  ),
  cand as (
    select
      ga.id, ga.name, ga.metacritic_score, ga.reviews_total,
      coalesce(
        (select gp.final_cents from public.game_prices gp where gp.game_id=ga.id and gp.currency='KRW'),
        (select gp.final_cents from public.game_prices gp where gp.game_id=ga.id and gp.currency='USD')
      ) as price_cents,
      coalesce(sum(f.weight), 0) as match_weight_sum
    from public.games ga
    join public.game_genres gg on gg.game_id = ga.id
    left join fav f on f.genre_id = gg.genre_id
    group by ga.id, ga.name, ga.metacritic_score, ga.reviews_total
  )
  select
    c.id, c.name, c.metacritic_score, c.reviews_total,
    c.price_cents,
    (select url from public.covers where id = c.id) as cover_url
  from cand c
  where (p_budget_cents is null or c.price_cents is null or c.price_cents <= p_budget_cents)
  order by (
    coalesce(c.metacritic_score, 0)
    + ln(greatest(c.reviews_total, 1)) * 10
    + c.match_weight_sum * 15
  ) desc
  limit greatest(p_limit, 1)
$$;


ALTER FUNCTION "public"."recommend_games"("p_user" "uuid", "p_budget_cents" integer, "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recommend_games_cards"("p_user" "uuid", "p_budget_cents" integer DEFAULT NULL::integer, "p_limit" integer DEFAULT 30, "p_exclude_upcoming" boolean DEFAULT true) RETURNS TABLE("id" bigint, "name" "text", "image" "text")
    LANGUAGE "sql" STABLE
    AS $$
  with
  fav_genre as (
    select genre_id, weight from public.user_genre_preferences where user_id = p_user
    union all
    select g.id, 1.0
    from public.profiles pf
    join lateral unnest(coalesce(pf.favorite_genres, '{}')) fn(name) on true
    join public.genres g on lower(g.name) = lower(fn.name)
    where pf.id = p_user
  ),
  fav_tag as (
    select tag_id, weight from public.user_tag_preferences where user_id = p_user
  ),
  tag_idf as (
    select gt.tag_id,
           greatest( ln( (select greatest(count(*), 1) from public.games)::numeric / (1 + count(*)) ), 0.0 ) as idf
    from public.game_tags gt group by gt.tag_id
  ),
  prior as (
    select coalesce(avg(positive_ratio), 0.80) as prior_c from public.games where positive_ratio is not null
  ),
  cand as (
    select
      ga.id, ga.name,
      coalesce(ga.header_image, (select url from public.covers c where c.id = ga.id)) as image,
      ga.first_release_date, ga.total_positive, ga.total_negative,
      coalesce(
        (select gp.final_cents from public.game_prices gp where gp.game_id = ga.id and gp.currency = 'KRW'),
        (select gp.final_cents from public.game_prices gp where gp.game_id = ga.id and gp.currency = 'USD')
      ) as price_cents,
      coalesce((select max(gp.discount_percent) from public.game_prices gp where gp.game_id = ga.id), 0) as discount_percent,
      coalesce((
        select sum(fg.weight) from public.game_genres gg
        join fav_genre fg on fg.genre_id = gg.genre_id where gg.game_id = ga.id
      ), 0) as genre_score,
      coalesce((
        select sum(ft.weight * ti.idf) from public.game_tags gt
        join fav_tag ft on ft.tag_id = gt.tag_id
        join tag_idf ti on ti.tag_id = gt.tag_id where gt.game_id = ga.id
      ), 0) as tag_score
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
  )
  select s.id, s.name, s.image
  from scored s
  where (p_budget_cents is null or s.price_cents is null or s.price_cents <= p_budget_cents)
    and (not p_exclude_upcoming or s.first_release_date is null or s.first_release_date <= now())
    and not exists (select 1 from public.user_saved_games us where us.user_id = p_user and us.game_id = s.id)
    and not exists (select 1 from public.user_game_feedback uf where uf.user_id = p_user and uf.game_id = s.id and uf.dismissed)
  order by
    ( s.genre_score * 6
    + least(s.tag_score, 8.0) * 4
    + s.quality * 50
    + s.recency * 0.3
    + s.discount_percent * 0.4
    ) desc,
    s.first_release_date desc nulls last,
    s.id desc
  limit greatest(p_limit, 1);
$$;


ALTER FUNCTION "public"."recommend_games_cards"("p_user" "uuid", "p_budget_cents" integer, "p_limit" integer, "p_exclude_upcoming" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_games"("q" "text", "p_limit" integer DEFAULT 8) RETURNS TABLE("id" bigint, "name" "text", "image" "text", "score" numeric)
    LANGUAGE "sql" STABLE
    AS $$
  with base as (
    select
      g.id,
      g.name,
      coalesce(c.url, g.header_image) as image,
      greatest(
        similarity(g.name, q),                    -- 오타/유사도
        case when g.name ilike q || '%' then 1.0  -- 접두사 가중
             when g.name ilike '%' || q || '%' then 0.6
             else 0 end
      ) as s
    from public.games g
    left join public.covers c on c.id = g.id
    where g.name % q or g.name ilike '%' || q || '%'
  )
  select id, name, image, s as score
  from base
  order by score desc, id desc
  limit p_limit;
$$;


ALTER FUNCTION "public"."search_games"("q" "text", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_first_release_date_from_text"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  parsed timestamptz;
begin
  -- 새 텍스트를 해석
  if new.release_date_text is not null then
    parsed := public.parse_korean_date(new.release_date_text);
  else
    parsed := null;
  end if;

  -- 1) 신규/수정 시 first_release_date가 비어 있으면 채움
  if new.first_release_date is null and parsed is not null then
    new.first_release_date := parsed;
  end if;

  -- 2) 텍스트가 변경되었고, 파싱 결과가 기존 값과 다르면 동기화
  if (tg_op = 'UPDATE')
     and (new.release_date_text is distinct from old.release_date_text)
     and (parsed is distinct from new.first_release_date) then
    new.first_release_date := parsed;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."set_first_release_date_from_text"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_signup_genres"("p_genres" "text"[]) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'unauthorized';
  end if;

  -- 1) UI용 배열 저장 (한글/영문 그대로 보관)
  update public.profiles
  set favorite_genres = p_genres
  where id = v_uid;

  -- 2) 정규화 선호 시드: 영문명 OR 번역(ko) 둘 다 매칭
  insert into public.user_genre_preferences (user_id, genre_id, weight)
  select distinct v_uid, g.id, 1.0
  from unnest(coalesce(p_genres, '{}')) as fn(name)
  join public.genres g
    on lower(g.name) = lower(fn.name)
    or exists (
      select 1 from public.genre_translations gt
      where gt.genre_id = g.id
        and gt.lang = 'ko'
        and lower(gt.name) = lower(fn.name)
    )
  on conflict (user_id, genre_id) do update
    set weight = 1.0; -- 초기화 성격
end
$$;


ALTER FUNCTION "public"."set_signup_genres"("p_genres" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end $$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."try_timestamptz"("t" "text") RETURNS timestamp with time zone
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
begin
  if t is null or length(btrim(t)) = 0 then
    return null;
  end if;
  begin
    return t::timestamptz;
  exception when others then
    return null;
  end;
end;
$$;


ALTER FUNCTION "public"."try_timestamptz"("t" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."categories" (
    "id" bigint NOT NULL,
    "name" "text" NOT NULL
);


ALTER TABLE "public"."categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."covers" (
    "id" bigint NOT NULL,
    "url" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."covers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."developers" (
    "id" bigint NOT NULL,
    "name" "text" NOT NULL
);


ALTER TABLE "public"."developers" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."developers_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."developers_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."developers_id_seq" OWNED BY "public"."developers"."id";



CREATE TABLE IF NOT EXISTS "public"."game_categories" (
    "game_id" bigint NOT NULL,
    "category_id" bigint NOT NULL
);


ALTER TABLE "public"."game_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."game_developers" (
    "game_id" bigint NOT NULL,
    "developer_id" bigint NOT NULL
);


ALTER TABLE "public"."game_developers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."game_genres" (
    "game_id" bigint NOT NULL,
    "genre_id" bigint NOT NULL
);


ALTER TABLE "public"."game_genres" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."game_platforms" (
    "game_id" bigint NOT NULL,
    "platform_id" "text" NOT NULL
);


ALTER TABLE "public"."game_platforms" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."game_price_history" (
    "game_id" bigint NOT NULL,
    "currency" "text" NOT NULL,
    "final_cents" integer,
    "initial_cents" integer,
    "discount_percent" integer,
    "captured_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."game_price_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."game_prices" (
    "game_id" bigint NOT NULL,
    "currency" "text" NOT NULL,
    "final_cents" integer,
    "initial_cents" integer,
    "discount_percent" integer,
    "fetched_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."game_prices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."game_publishers" (
    "game_id" bigint NOT NULL,
    "publisher_id" bigint NOT NULL
);


ALTER TABLE "public"."game_publishers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."game_raw_payloads" (
    "game_id" bigint NOT NULL,
    "raw" "jsonb" NOT NULL
);


ALTER TABLE "public"."game_raw_payloads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."game_requirements" (
    "game_id" bigint NOT NULL,
    "minimum_html" "text",
    "recommended_html" "text"
);


ALTER TABLE "public"."game_requirements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."game_screenshots" (
    "game_id" bigint NOT NULL,
    "shot_id" bigint NOT NULL,
    "url_full" "text" NOT NULL,
    "url_thumb" "text"
);


ALTER TABLE "public"."game_screenshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."game_tags" (
    "game_id" bigint NOT NULL,
    "tag_id" bigint NOT NULL,
    "votes" integer
);


ALTER TABLE "public"."game_tags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."game_videos" (
    "game_id" bigint NOT NULL,
    "video_id" bigint NOT NULL,
    "name" "text",
    "thumbnail" "text",
    "mp4_max" "text",
    "highlight" boolean
);


ALTER TABLE "public"."game_videos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."games" (
    "id" bigint NOT NULL,
    "name" "text" NOT NULL,
    "type" "text",
    "summary" "text",
    "header_image" "text",
    "first_release_date" timestamp with time zone,
    "metacritic_score" integer,
    "reviews_total" integer,
    "cover_id" bigint,
    "refreshed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "release_date_text" "text",
    "metacritic_url" "text",
    "positive_ratio" double precision,
    "total_positive" integer,
    "total_negative" integer,
    "review_score_desc" "text",
    "ccu" integer
);


ALTER TABLE "public"."games" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."genre_translations" (
    "genre_id" bigint NOT NULL,
    "lang" "text" NOT NULL,
    "name" "text" NOT NULL
);


ALTER TABLE "public"."genre_translations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."genres" (
    "id" bigint NOT NULL,
    "name" "text" NOT NULL
);


ALTER TABLE "public"."genres" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."platforms" (
    "id" "text" NOT NULL
);


ALTER TABLE "public"."platforms" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "favorite_genres" "text"[],
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "nickname" "text",
    CONSTRAINT "chk_profiles_nickname" CHECK ((("nickname" IS NULL) OR (("nickname" !~ '\s'::"text") AND (("length"("nickname") >= 2) AND ("length"("nickname") <= 30)))))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."publishers" (
    "id" bigint NOT NULL,
    "name" "text" NOT NULL
);


ALTER TABLE "public"."publishers" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."publishers_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."publishers_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."publishers_id_seq" OWNED BY "public"."publishers"."id";



CREATE TABLE IF NOT EXISTS "public"."tags" (
    "id" bigint NOT NULL,
    "name" "text" NOT NULL
);


ALTER TABLE "public"."tags" OWNER TO "postgres";


ALTER TABLE "public"."tags" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."tags_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."user_events" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "game_id" bigint,
    "event_type" "text" NOT NULL,
    "value" real,
    "source" "text",
    "session_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['impression'::"text", 'card_click'::"text", 'detail_view'::"text", 'save'::"text", 'unsave'::"text", 'dismiss'::"text", 'search_click'::"text", 'dwell'::"text"])))
);


ALTER TABLE "public"."user_events" OWNER TO "postgres";


ALTER TABLE "public"."user_events" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."user_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."user_game_feedback" (
    "user_id" "uuid" NOT NULL,
    "game_id" bigint NOT NULL,
    "rating" smallint,
    "dismissed" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_game_feedback_rating_check" CHECK (("rating" = ANY (ARRAY['-1'::integer, 1])))
);


ALTER TABLE "public"."user_game_feedback" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_genre_preferences" (
    "user_id" "uuid" NOT NULL,
    "genre_id" bigint NOT NULL,
    "weight" numeric DEFAULT 1.0 NOT NULL
);


ALTER TABLE "public"."user_genre_preferences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_saved_games" (
    "user_id" "uuid" NOT NULL,
    "game_id" bigint NOT NULL,
    "saved_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_saved_games" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_tag_preferences" (
    "user_id" "uuid" NOT NULL,
    "tag_id" bigint NOT NULL,
    "weight" numeric DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."user_tag_preferences" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_genres_ko" WITH ("security_invoker"='true') AS
 SELECT "g"."id",
    COALESCE("gt"."name", "g"."name") AS "name"
   FROM ("public"."genres" "g"
     LEFT JOIN "public"."genre_translations" "gt" ON ((("gt"."genre_id" = "g"."id") AND ("gt"."lang" = 'ko'::"text"))));


ALTER VIEW "public"."v_genres_ko" OWNER TO "postgres";


ALTER TABLE ONLY "public"."developers" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."developers_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."publishers" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."publishers_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."covers"
    ADD CONSTRAINT "covers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."developers"
    ADD CONSTRAINT "developers_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."developers"
    ADD CONSTRAINT "developers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."game_categories"
    ADD CONSTRAINT "game_categories_pkey" PRIMARY KEY ("game_id", "category_id");



ALTER TABLE ONLY "public"."game_developers"
    ADD CONSTRAINT "game_developers_pkey" PRIMARY KEY ("game_id", "developer_id");



ALTER TABLE ONLY "public"."game_genres"
    ADD CONSTRAINT "game_genres_pkey" PRIMARY KEY ("game_id", "genre_id");



ALTER TABLE ONLY "public"."game_platforms"
    ADD CONSTRAINT "game_platforms_pkey" PRIMARY KEY ("game_id", "platform_id");



ALTER TABLE ONLY "public"."game_prices"
    ADD CONSTRAINT "game_prices_pkey" PRIMARY KEY ("game_id", "currency");



ALTER TABLE ONLY "public"."game_publishers"
    ADD CONSTRAINT "game_publishers_pkey" PRIMARY KEY ("game_id", "publisher_id");



ALTER TABLE ONLY "public"."game_raw_payloads"
    ADD CONSTRAINT "game_raw_payloads_pkey" PRIMARY KEY ("game_id");



ALTER TABLE ONLY "public"."game_requirements"
    ADD CONSTRAINT "game_requirements_pkey" PRIMARY KEY ("game_id");



ALTER TABLE ONLY "public"."game_screenshots"
    ADD CONSTRAINT "game_screenshots_pkey" PRIMARY KEY ("game_id", "shot_id");



ALTER TABLE ONLY "public"."game_tags"
    ADD CONSTRAINT "game_tags_pkey" PRIMARY KEY ("game_id", "tag_id");



ALTER TABLE ONLY "public"."game_videos"
    ADD CONSTRAINT "game_videos_pkey" PRIMARY KEY ("game_id", "video_id");



ALTER TABLE ONLY "public"."games"
    ADD CONSTRAINT "games_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."genre_translations"
    ADD CONSTRAINT "genre_translations_pkey" PRIMARY KEY ("genre_id", "lang");



ALTER TABLE ONLY "public"."genres"
    ADD CONSTRAINT "genres_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."platforms"
    ADD CONSTRAINT "platforms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."publishers"
    ADD CONSTRAINT "publishers_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."publishers"
    ADD CONSTRAINT "publishers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tags"
    ADD CONSTRAINT "tags_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."tags"
    ADD CONSTRAINT "tags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_events"
    ADD CONSTRAINT "user_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_game_feedback"
    ADD CONSTRAINT "user_game_feedback_pkey" PRIMARY KEY ("user_id", "game_id");



ALTER TABLE ONLY "public"."user_genre_preferences"
    ADD CONSTRAINT "user_genre_preferences_pkey" PRIMARY KEY ("user_id", "genre_id");



ALTER TABLE ONLY "public"."user_saved_games"
    ADD CONSTRAINT "user_saved_games_pkey" PRIMARY KEY ("user_id", "game_id");



ALTER TABLE ONLY "public"."user_tag_preferences"
    ADD CONSTRAINT "user_tag_preferences_pkey" PRIMARY KEY ("user_id", "tag_id");



CREATE INDEX "game_tags_tag_idx" ON "public"."game_tags" USING "btree" ("tag_id");



CREATE INDEX "idx_game_categories_game" ON "public"."game_categories" USING "btree" ("game_id", "category_id");



CREATE INDEX "idx_game_developers_game" ON "public"."game_developers" USING "btree" ("game_id", "developer_id");



CREATE INDEX "idx_game_genres_genre" ON "public"."game_genres" USING "btree" ("genre_id", "game_id");



CREATE INDEX "idx_game_platforms_game" ON "public"."game_platforms" USING "btree" ("game_id", "platform_id");



CREATE INDEX "idx_game_publishers_game" ON "public"."game_publishers" USING "btree" ("game_id", "publisher_id");



CREATE INDEX "idx_games_first_release_date_desc" ON "public"."games" USING "btree" ("first_release_date" DESC NULLS LAST);



CREATE INDEX "idx_games_mc" ON "public"."games" USING "btree" ("metacritic_score" DESC NULLS LAST);



CREATE INDEX "idx_games_name_trgm" ON "public"."games" USING "gin" ("name" "public"."gin_trgm_ops");



CREATE INDEX "idx_games_release" ON "public"."games" USING "btree" ("first_release_date" DESC NULLS LAST);



CREATE INDEX "idx_games_updated_at_desc" ON "public"."games" USING "btree" ("updated_at" DESC);



CREATE INDEX "idx_genre_translations_lang" ON "public"."genre_translations" USING "btree" ("lang");



CREATE INDEX "idx_genre_translations_name_ci" ON "public"."genre_translations" USING "btree" ("lower"("name"));



CREATE INDEX "idx_saved_game" ON "public"."user_saved_games" USING "btree" ("game_id");



CREATE INDEX "idx_saved_user_date" ON "public"."user_saved_games" USING "btree" ("user_id", "saved_at" DESC);



CREATE INDEX "user_events_game_type_idx" ON "public"."user_events" USING "btree" ("game_id", "event_type");



CREATE INDEX "user_events_user_created_idx" ON "public"."user_events" USING "btree" ("user_id", "created_at" DESC);



CREATE UNIQUE INDEX "ux_genres_name" ON "public"."genres" USING "btree" ("name");



CREATE UNIQUE INDEX "ux_profiles_nickname_lower" ON "public"."profiles" USING "btree" ("lower"("nickname"));



CREATE OR REPLACE TRIGGER "trg_covers_updated_at" BEFORE UPDATE ON "public"."covers" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_games_updated_at" BEFORE UPDATE ON "public"."games" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_saved_games_weight" AFTER INSERT OR DELETE ON "public"."user_saved_games" FOR EACH ROW EXECUTE FUNCTION "public"."bump_weight_on_save"();



CREATE OR REPLACE TRIGGER "trg_set_first_release_date" BEFORE INSERT OR UPDATE OF "release_date_text", "first_release_date" ON "public"."games" FOR EACH ROW EXECUTE FUNCTION "public"."set_first_release_date_from_text"();



ALTER TABLE ONLY "public"."game_categories"
    ADD CONSTRAINT "game_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."game_categories"
    ADD CONSTRAINT "game_categories_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."game_developers"
    ADD CONSTRAINT "game_developers_developer_id_fkey" FOREIGN KEY ("developer_id") REFERENCES "public"."developers"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."game_developers"
    ADD CONSTRAINT "game_developers_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."game_genres"
    ADD CONSTRAINT "game_genres_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."game_genres"
    ADD CONSTRAINT "game_genres_genre_id_fkey" FOREIGN KEY ("genre_id") REFERENCES "public"."genres"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."game_platforms"
    ADD CONSTRAINT "game_platforms_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."game_platforms"
    ADD CONSTRAINT "game_platforms_platform_id_fkey" FOREIGN KEY ("platform_id") REFERENCES "public"."platforms"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."game_price_history"
    ADD CONSTRAINT "game_price_history_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."game_prices"
    ADD CONSTRAINT "game_prices_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."game_publishers"
    ADD CONSTRAINT "game_publishers_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."game_publishers"
    ADD CONSTRAINT "game_publishers_publisher_id_fkey" FOREIGN KEY ("publisher_id") REFERENCES "public"."publishers"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."game_raw_payloads"
    ADD CONSTRAINT "game_raw_payloads_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."game_requirements"
    ADD CONSTRAINT "game_requirements_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."game_screenshots"
    ADD CONSTRAINT "game_screenshots_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."game_tags"
    ADD CONSTRAINT "game_tags_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."game_tags"
    ADD CONSTRAINT "game_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."game_videos"
    ADD CONSTRAINT "game_videos_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."games"
    ADD CONSTRAINT "games_cover_id_fkey" FOREIGN KEY ("cover_id") REFERENCES "public"."covers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."genre_translations"
    ADD CONSTRAINT "genre_translations_genre_id_fkey" FOREIGN KEY ("genre_id") REFERENCES "public"."genres"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_events"
    ADD CONSTRAINT "user_events_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_events"
    ADD CONSTRAINT "user_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_game_feedback"
    ADD CONSTRAINT "user_game_feedback_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_game_feedback"
    ADD CONSTRAINT "user_game_feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_genre_preferences"
    ADD CONSTRAINT "user_genre_preferences_genre_id_fkey" FOREIGN KEY ("genre_id") REFERENCES "public"."genres"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."user_saved_games"
    ADD CONSTRAINT "user_saved_games_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_tag_preferences"
    ADD CONSTRAINT "user_tag_preferences_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_tag_preferences"
    ADD CONSTRAINT "user_tag_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE "public"."categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."covers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."developers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."game_categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."game_developers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."game_genres" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."game_platforms" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."game_price_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."game_prices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."game_publishers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."game_raw_payloads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."game_requirements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."game_screenshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."game_tags" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "game_tags_read_all" ON "public"."game_tags" FOR SELECT TO "authenticated", "anon" USING (true);



ALTER TABLE "public"."game_videos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."games" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."genre_translations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."genres" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."platforms" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_select_own" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "profiles_update_own" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "profiles_upsert_service" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."publishers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "read_all_categories" ON "public"."categories" FOR SELECT USING (true);



CREATE POLICY "read_all_covers" ON "public"."covers" FOR SELECT USING (true);



CREATE POLICY "read_all_developers" ON "public"."developers" FOR SELECT USING (true);



CREATE POLICY "read_all_game_categories" ON "public"."game_categories" FOR SELECT USING (true);



CREATE POLICY "read_all_game_developers" ON "public"."game_developers" FOR SELECT USING (true);



CREATE POLICY "read_all_game_genres" ON "public"."game_genres" FOR SELECT USING (true);



CREATE POLICY "read_all_game_platforms" ON "public"."game_platforms" FOR SELECT USING (true);



CREATE POLICY "read_all_game_price_history" ON "public"."game_price_history" FOR SELECT USING (true);



CREATE POLICY "read_all_game_prices" ON "public"."game_prices" FOR SELECT USING (true);



CREATE POLICY "read_all_game_publishers" ON "public"."game_publishers" FOR SELECT USING (true);



CREATE POLICY "read_all_game_raw_payloads" ON "public"."game_raw_payloads" FOR SELECT USING (true);



CREATE POLICY "read_all_game_requirements" ON "public"."game_requirements" FOR SELECT USING (true);



CREATE POLICY "read_all_game_screenshots" ON "public"."game_screenshots" FOR SELECT USING (true);



CREATE POLICY "read_all_game_videos" ON "public"."game_videos" FOR SELECT USING (true);



CREATE POLICY "read_all_games" ON "public"."games" FOR SELECT USING (true);



CREATE POLICY "read_all_genre_translations" ON "public"."genre_translations" FOR SELECT USING (true);



CREATE POLICY "read_all_genres" ON "public"."genres" FOR SELECT USING (true);



CREATE POLICY "read_all_platforms" ON "public"."platforms" FOR SELECT USING (true);



CREATE POLICY "read_all_publishers" ON "public"."publishers" FOR SELECT USING (true);



CREATE POLICY "saved_delete_own" ON "public"."user_saved_games" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "saved_insert_own" ON "public"."user_saved_games" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "saved_select_own" ON "public"."user_saved_games" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "srv_write_categories" ON "public"."categories" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "srv_write_covers" ON "public"."covers" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "srv_write_developers" ON "public"."developers" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "srv_write_game_categories" ON "public"."game_categories" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "srv_write_game_developers" ON "public"."game_developers" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "srv_write_game_genres" ON "public"."game_genres" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "srv_write_game_platforms" ON "public"."game_platforms" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "srv_write_game_price_history" ON "public"."game_price_history" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "srv_write_game_prices" ON "public"."game_prices" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "srv_write_game_publishers" ON "public"."game_publishers" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "srv_write_game_raw_payloads" ON "public"."game_raw_payloads" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "srv_write_game_requirements" ON "public"."game_requirements" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "srv_write_game_screenshots" ON "public"."game_screenshots" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "srv_write_game_videos" ON "public"."game_videos" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "srv_write_games" ON "public"."games" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "srv_write_genre_translations" ON "public"."genre_translations" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "srv_write_genres" ON "public"."genres" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "srv_write_platforms" ON "public"."platforms" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "srv_write_publishers" ON "public"."publishers" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."tags" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tags_read_all" ON "public"."tags" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "ugp_delete_own" ON "public"."user_genre_preferences" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "ugp_insert_own" ON "public"."user_genre_preferences" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "ugp_select_own" ON "public"."user_genre_preferences" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "ugp_update_own" ON "public"."user_genre_preferences" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."user_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_events_insert_own" ON "public"."user_events" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "user_events_select_own" ON "public"."user_events" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."user_game_feedback" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_game_feedback_all_own" ON "public"."user_game_feedback" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."user_genre_preferences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_saved_games" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_tag_preferences" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "utp_delete_own" ON "public"."user_tag_preferences" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "utp_insert_own" ON "public"."user_tag_preferences" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "utp_select_own" ON "public"."user_tag_preferences" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "utp_update_own" ON "public"."user_tag_preferences" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "service_role";








































































































































































GRANT ALL ON FUNCTION "public"."browse_games_by_genres_cards"("p_genre_ids" bigint[], "p_order" "text", "p_limit" integer, "p_offset" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."browse_games_by_genres_cards"("p_genre_ids" bigint[], "p_order" "text", "p_limit" integer, "p_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."browse_games_by_genres_cards"("p_genre_ids" bigint[], "p_order" "text", "p_limit" integer, "p_offset" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."bump_weight_on_save"() TO "anon";
GRANT ALL ON FUNCTION "public"."bump_weight_on_save"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."bump_weight_on_save"() TO "service_role";



GRANT ALL ON FUNCTION "public"."contains_any"("raw" "text", "arr" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."contains_any"("raw" "text", "arr" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."contains_any"("raw" "text", "arr" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_game_detail"("p_id" bigint, "p_currency_primary" "text", "p_currency_fallback" "text", "p_limit_videos" integer, "p_limit_screens" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_game_detail"("p_id" bigint, "p_currency_primary" "text", "p_currency_fallback" "text", "p_limit_videos" integer, "p_limit_screens" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_game_detail"("p_id" bigint, "p_currency_primary" "text", "p_currency_fallback" "text", "p_limit_videos" integer, "p_limit_screens" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_games_cards_by_ids"("p_ids" bigint[], "p_allow_categories" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_games_cards_by_ids"("p_ids" bigint[], "p_allow_categories" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_games_cards_by_ids"("p_ids" bigint[], "p_allow_categories" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."list_games_cards"("p_genre_ids" integer[], "p_allow_categories" "text"[], "p_limit" integer, "p_offset" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."list_games_cards"("p_genre_ids" integer[], "p_allow_categories" "text"[], "p_limit" integer, "p_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_games_cards"("p_genre_ids" integer[], "p_allow_categories" "text"[], "p_limit" integer, "p_offset" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."list_saved_on_sale"("p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_saved_on_sale"("p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_saved_on_sale"("p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."list_similar_games"("p_game_id" bigint, "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_similar_games"("p_game_id" bigint, "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."list_similar_games"("p_game_id" bigint, "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_similar_games"("p_game_id" bigint, "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."list_upcoming_games_cards"("p_limit" integer, "p_offset" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."list_upcoming_games_cards"("p_limit" integer, "p_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_upcoming_games_cards"("p_limit" integer, "p_offset" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."norm_text"("t" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."norm_text"("t" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."norm_text"("t" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."parent_category_of_one"("raw" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."parent_category_of_one"("raw" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."parent_category_of_one"("raw" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."parse_korean_date"("s" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."parse_korean_date"("s" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."parse_korean_date"("s" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."recommend_games"("p_user" "uuid", "p_budget_cents" integer, "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."recommend_games"("p_user" "uuid", "p_budget_cents" integer, "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."recommend_games"("p_user" "uuid", "p_budget_cents" integer, "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."recommend_games_cards"("p_user" "uuid", "p_budget_cents" integer, "p_limit" integer, "p_exclude_upcoming" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."recommend_games_cards"("p_user" "uuid", "p_budget_cents" integer, "p_limit" integer, "p_exclude_upcoming" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."recommend_games_cards"("p_user" "uuid", "p_budget_cents" integer, "p_limit" integer, "p_exclude_upcoming" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."search_games"("q" "text", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."search_games"("q" "text", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_games"("q" "text", "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_first_release_date_from_text"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_first_release_date_from_text"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_first_release_date_from_text"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "postgres";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "anon";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_signup_genres"("p_genres" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."set_signup_genres"("p_genres" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_signup_genres"("p_genres" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."show_limit"() TO "postgres";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."try_timestamptz"("t" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."try_timestamptz"("t" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."try_timestamptz"("t" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "service_role";



SET SESSION AUTHORIZATION "postgres";
RESET SESSION AUTHORIZATION;



SET SESSION AUTHORIZATION "postgres";
RESET SESSION AUTHORIZATION;



SET SESSION AUTHORIZATION "postgres";
RESET SESSION AUTHORIZATION;












GRANT ALL ON TABLE "public"."categories" TO "anon";
GRANT ALL ON TABLE "public"."categories" TO "authenticated";
GRANT ALL ON TABLE "public"."categories" TO "service_role";



GRANT ALL ON TABLE "public"."covers" TO "anon";
GRANT ALL ON TABLE "public"."covers" TO "authenticated";
GRANT ALL ON TABLE "public"."covers" TO "service_role";



GRANT ALL ON TABLE "public"."developers" TO "anon";
GRANT ALL ON TABLE "public"."developers" TO "authenticated";
GRANT ALL ON TABLE "public"."developers" TO "service_role";



GRANT ALL ON SEQUENCE "public"."developers_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."developers_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."developers_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."game_categories" TO "anon";
GRANT ALL ON TABLE "public"."game_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."game_categories" TO "service_role";



GRANT ALL ON TABLE "public"."game_developers" TO "anon";
GRANT ALL ON TABLE "public"."game_developers" TO "authenticated";
GRANT ALL ON TABLE "public"."game_developers" TO "service_role";



GRANT ALL ON TABLE "public"."game_genres" TO "anon";
GRANT ALL ON TABLE "public"."game_genres" TO "authenticated";
GRANT ALL ON TABLE "public"."game_genres" TO "service_role";



GRANT ALL ON TABLE "public"."game_platforms" TO "anon";
GRANT ALL ON TABLE "public"."game_platforms" TO "authenticated";
GRANT ALL ON TABLE "public"."game_platforms" TO "service_role";



GRANT ALL ON TABLE "public"."game_price_history" TO "anon";
GRANT ALL ON TABLE "public"."game_price_history" TO "authenticated";
GRANT ALL ON TABLE "public"."game_price_history" TO "service_role";



GRANT ALL ON TABLE "public"."game_prices" TO "anon";
GRANT ALL ON TABLE "public"."game_prices" TO "authenticated";
GRANT ALL ON TABLE "public"."game_prices" TO "service_role";



GRANT ALL ON TABLE "public"."game_publishers" TO "anon";
GRANT ALL ON TABLE "public"."game_publishers" TO "authenticated";
GRANT ALL ON TABLE "public"."game_publishers" TO "service_role";



GRANT ALL ON TABLE "public"."game_raw_payloads" TO "anon";
GRANT ALL ON TABLE "public"."game_raw_payloads" TO "authenticated";
GRANT ALL ON TABLE "public"."game_raw_payloads" TO "service_role";



GRANT ALL ON TABLE "public"."game_requirements" TO "anon";
GRANT ALL ON TABLE "public"."game_requirements" TO "authenticated";
GRANT ALL ON TABLE "public"."game_requirements" TO "service_role";



GRANT ALL ON TABLE "public"."game_screenshots" TO "anon";
GRANT ALL ON TABLE "public"."game_screenshots" TO "authenticated";
GRANT ALL ON TABLE "public"."game_screenshots" TO "service_role";



GRANT ALL ON TABLE "public"."game_tags" TO "anon";
GRANT ALL ON TABLE "public"."game_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."game_tags" TO "service_role";



GRANT ALL ON TABLE "public"."game_videos" TO "anon";
GRANT ALL ON TABLE "public"."game_videos" TO "authenticated";
GRANT ALL ON TABLE "public"."game_videos" TO "service_role";



GRANT ALL ON TABLE "public"."games" TO "anon";
GRANT ALL ON TABLE "public"."games" TO "authenticated";
GRANT ALL ON TABLE "public"."games" TO "service_role";



GRANT ALL ON TABLE "public"."genre_translations" TO "anon";
GRANT ALL ON TABLE "public"."genre_translations" TO "authenticated";
GRANT ALL ON TABLE "public"."genre_translations" TO "service_role";



GRANT ALL ON TABLE "public"."genres" TO "anon";
GRANT ALL ON TABLE "public"."genres" TO "authenticated";
GRANT ALL ON TABLE "public"."genres" TO "service_role";



GRANT ALL ON TABLE "public"."platforms" TO "anon";
GRANT ALL ON TABLE "public"."platforms" TO "authenticated";
GRANT ALL ON TABLE "public"."platforms" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."publishers" TO "anon";
GRANT ALL ON TABLE "public"."publishers" TO "authenticated";
GRANT ALL ON TABLE "public"."publishers" TO "service_role";



GRANT ALL ON SEQUENCE "public"."publishers_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."publishers_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."publishers_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."tags" TO "anon";
GRANT ALL ON TABLE "public"."tags" TO "authenticated";
GRANT ALL ON TABLE "public"."tags" TO "service_role";



GRANT ALL ON SEQUENCE "public"."tags_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."tags_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."tags_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."user_events" TO "anon";
GRANT ALL ON TABLE "public"."user_events" TO "authenticated";
GRANT ALL ON TABLE "public"."user_events" TO "service_role";



GRANT ALL ON SEQUENCE "public"."user_events_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."user_events_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."user_events_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."user_game_feedback" TO "anon";
GRANT ALL ON TABLE "public"."user_game_feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."user_game_feedback" TO "service_role";



GRANT ALL ON TABLE "public"."user_genre_preferences" TO "anon";
GRANT ALL ON TABLE "public"."user_genre_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."user_genre_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."user_saved_games" TO "anon";
GRANT ALL ON TABLE "public"."user_saved_games" TO "authenticated";
GRANT ALL ON TABLE "public"."user_saved_games" TO "service_role";



GRANT ALL ON TABLE "public"."user_tag_preferences" TO "anon";
GRANT ALL ON TABLE "public"."user_tag_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."user_tag_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."v_genres_ko" TO "anon";
GRANT ALL ON TABLE "public"."v_genres_ko" TO "authenticated";
GRANT ALL ON TABLE "public"."v_genres_ko" TO "service_role";



SET SESSION AUTHORIZATION "postgres";
RESET SESSION AUTHORIZATION;



SET SESSION AUTHORIZATION "postgres";
RESET SESSION AUTHORIZATION;



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



































