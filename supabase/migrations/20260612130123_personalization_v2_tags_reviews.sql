-- =============================================================================
-- 개인화 v2-1: Steam 유저 태그 + 리뷰 평판 데이터 토대
-- 적용: 이미 prod 에 적용됨 (Supabase MCP, 이력 version 20260612130123).
--       신규 환경은 `supabase db push` 로 적용 (파일명 timestamp = 이력 version).
-- 참고: docs/personalization-plan.md 5장
--
-- 적재는 scripts/ingest-steam.ts 가 채운다:
--   - games.positive_ratio 등  ← Steam appreviews API
--   - tags / game_tags         ← SteamSpy API (태그 이름 → 투표수)
--   - games.ccu                ← SteamSpy 동시 접속
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) games — 평판/인기 컬럼 추가 (모두 nullable, 적재 전엔 NULL)
-- -----------------------------------------------------------------------------
alter table public.games
  add column if not exists positive_ratio    double precision, -- total_positive / total_reviews (0~1)
  add column if not exists total_positive    integer,
  add column if not exists total_negative    integer,
  add column if not exists review_score_desc text,      -- "Overwhelmingly Positive" 등 (영문 원문)
  add column if not exists ccu               integer;   -- SteamSpy 동시 접속 추정

-- -----------------------------------------------------------------------------
-- 2) tags — Steam 유저 태그 lookup (이름 unique)
-- -----------------------------------------------------------------------------
create table if not exists public.tags (
  id   bigint generated always as identity primary key,
  name text not null unique
);

-- -----------------------------------------------------------------------------
-- 3) game_tags — 게임 ↔ 태그 M:N, votes = 태그 강도(투표수)
-- -----------------------------------------------------------------------------
create table if not exists public.game_tags (
  game_id bigint  not null references public.games(id) on delete cascade,
  tag_id  bigint  not null references public.tags(id) on delete cascade,
  votes   integer,
  primary key (game_id, tag_id)
);
-- game_id 단독 조회(WHERE game_id = ?)는 복합 PK(game_id, tag_id) 인덱스가
-- 커버하므로 별도 인덱스를 만들지 않는다. tag_id 단독 조회만 인덱스가 필요.
create index if not exists game_tags_tag_idx on public.game_tags (tag_id);

-- -----------------------------------------------------------------------------
-- 4) RLS — 카탈로그 데이터이므로 공개 읽기 허용, 쓰기는 service_role(적재) 전용.
--    (anon/authenticated 는 select 만. insert/update/delete 정책 없음 → 차단)
-- -----------------------------------------------------------------------------
alter table public.tags enable row level security;
drop policy if exists tags_read_all on public.tags;
create policy tags_read_all on public.tags
  for select to anon, authenticated using (true);

alter table public.game_tags enable row level security;
drop policy if exists game_tags_read_all on public.game_tags;
create policy game_tags_read_all on public.game_tags
  for select to anon, authenticated using (true);
