/**
 * =============================================================================
 * scripts/backfill-tags.ts
 * -----------------------------------------------------------------------------
 * 역할: game_tags 가 비어있는 게임에만 SteamSpy 태그를 1회 백필한다.
 *
 *   ingest-steam.ts 는 게임마다 storefront(appdetails) 를 치는데, 태그만 채우는
 *   데엔 그게 불필요하다. SteamSpy(별도 호스트)만 호출하므로 빡빡한 storefront
 *   레이트리밋(≈200/5분)을 아예 건드리지 않는다 → 429 위험 없음.
 *
 *   태그 기능(FETCH_TAGS)이 나중에 추가돼, 그 전에 적재된 게임은 refreshed_at
 *   이 신선해서 이후 ingest 에서 스킵되어 태그가 영영 안 채워진 갭을 메운다.
 *   (신규 게임의 태그는 일일 cron 이 첫 적재 때 채우므로 이건 1회성.)
 *
 * 실행:
 *   npx tsx --env-file=.env.ingest scripts/backfill-tags.ts
 *
 * 안전장치: service_role 키 사용(RLS 우회). SteamSpy ≈1req/s → 1100ms 지연.
 * =============================================================================
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.INGEST_SUPABASE_URL;
const SERVICE_KEY = process.env.INGEST_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('환경변수 누락: INGEST_SUPABASE_URL / INGEST_SERVICE_ROLE_KEY');
  process.exit(1);
}

const DELAY_MS = Number(process.env.INGEST_STEAMSPY_DELAY_MS ?? 1100);
const TAG_TOP_N = Number(process.env.INGEST_TAG_TOP_N ?? 20);

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** PostgREST 1000행 상한 우회 — 페이지로 한 컬럼 전체를 모은다. */
async function allValues(table: string, col: string): Promise<number[]> {
  const out: number[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select(col).range(from, from + 999);
    if (error) throw new Error(`${table}.${col}: ${error.message}`);
    if (!data || data.length === 0) break;
    out.push(...data.map((r) => (r as Record<string, number>)[col]));
    if (data.length < 1000) break;
  }
  return out;
}

/** SteamSpy 유저 태그(이름→투표수). 실패/빈 데이터는 빈 배열. */
async function fetchSteamSpyTags(appid: number): Promise<{ name: string; votes: number }[]> {
  try {
    const res = await fetch(
      `https://steamspy.com/api.php?request=appdetails&appid=${appid}`,
      { headers: { accept: 'application/json' } },
    );
    if (!res.ok) {
      console.warn(`[steamspy ${res.status}] ${appid}`);
      return [];
    }
    const json = (await res.json().catch(() => null)) as {
      tags?: Record<string, number> | unknown[];
    } | null;
    // tags 는 보통 { "태그명": 투표수 } 객체. 데이터 없으면 빈 배열로 옴.
    if (!json || !json.tags || Array.isArray(json.tags)) return [];
    return Object.entries(json.tags).map(([name, votes]) => ({
      name,
      votes: Number(votes) || 0,
    }));
  } catch {
    return [];
  }
}

/** tags 테이블에서 이름으로 id 확보. name 유니크라 upsert 로 race-free. */
async function ensureTag(name: string): Promise<number | null> {
  const { data, error } = await sb
    .from('tags')
    .upsert({ name }, { onConflict: 'name' })
    .select('id')
    .single();
  if (error) {
    console.warn(`[tags upsert] ${name}: ${error.message}`);
    return null;
  }
  return data ? (data.id as number) : null;
}

async function main() {
  console.log('> 태그 없는 게임 집계 중...');
  const tagged = new Set(await allValues('game_tags', 'game_id'));
  const all = await allValues('games', 'id');
  const targets = all.filter((id) => !tagged.has(id));
  console.log(
    `  전체 ${all.length} · 태그있음 ${tagged.size} · 백필대상 ${targets.length}\n`,
  );

  // dry-run: 대상 집계만 확인하고 종료(쓰기·SteamSpy 호출 없음).
  if (process.env.BACKFILL_DRY_RUN === '1') {
    console.log('> dry-run 종료 (실제 적재 안 함).');
    return;
  }

  let filled = 0;
  let empty = 0;
  const startedAt = Date.now();

  for (let i = 0; i < targets.length; i++) {
    const appid = targets[i];
    const tags = await fetchSteamSpyTags(appid);

    if (tags.length > 0) {
      const top = [...tags].sort((a, b) => b.votes - a.votes).slice(0, TAG_TOP_N);
      const rows: { game_id: number; tag_id: number; votes: number }[] = [];
      for (const t of top) {
        const tagId = await ensureTag(t.name);
        if (tagId != null) rows.push({ game_id: appid, tag_id: tagId, votes: t.votes });
      }
      if (rows.length > 0) {
        await sb.from('game_tags').delete().eq('game_id', appid);
        const { error } = await sb.from('game_tags').insert(rows);
        if (error) console.warn(`[game_tags ins] ${appid}: ${error.message}`);
        else filled++;
      } else empty++;
    } else empty++;

    if ((i + 1) % 25 === 0 || i === targets.length - 1) {
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(0);
      console.log(
        `  --- ${i + 1}/${targets.length}  채움=${filled} 빈태그=${empty}  (${elapsed}s) ---`,
      );
    }

    if (i < targets.length - 1) await sleep(DELAY_MS);
  }

  console.log(`\n> 완료. 채움=${filled} 빈태그=${empty}`);
}

main().catch((e) => {
  console.error('치명적 오류:', e);
  process.exit(1);
});
