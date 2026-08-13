import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { fetchTasteCardAsViewer } from '@/lib/tasteCard';
import { tasteTitle } from '@/lib/tasteLabel';

export const alt = '겜믈리에 취향 리포트';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// 기본 폰트엔 한글 글리프가 없어서 그대로 두면 전부 두부(□)로 나온다.
// 굵기는 하나만 싣고 크기로 위계를 준다(파일 1.5MB × 2 를 피함).
// public/ 에 두는 이유: Turbopack 은 `new URL(..., import.meta.url)` 을 URL 이 아닌
// 경로 문자열로 바꿔서 fetch 가 깨진다. public/ 은 배포에 항상 포함되고 readFile 로 읽힌다.
let fontCache: Promise<Buffer> | null = null;
function loadFont() {
  // 실패한 Promise 를 그대로 캐시에 두면 `??=` 가 재할당을 안 해서 그 인스턴스의
  // OG 이미지가 영구히 죽는다 — 실패 시 캐시를 비워 다음 요청이 재시도하게 한다.
  fontCache ??= readFile(
    join(process.cwd(), 'public/fonts/Pretendard-Medium.otf'),
  ).catch((e) => {
    fontCache = null;
    throw e;
  });
  return fontCache;
}

export default async function Image(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  // 본인이 "이미지 저장"으로 직접 받을 땐 쿠키가 실려 오므로 공유 전에도 자기 카드가 나온다.
  const { card } = await fetchTasteCardAsViewer(id);
  const title = tasteTitle(card?.genres[0]?.name);
  const genres = card?.genres ?? [];
  const tags = card?.tags ?? [];

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          backgroundColor: '#09090b',
        }}
      >
        {card?.gameImage && (
          // satori 는 next/image 를 모른다 — OG 이미지 안에서는 <img> 가 유일한 선택지다.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={card.gameImage}
            alt=""
            style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        )}
        <div
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            background:
              'linear-gradient(to bottom, rgba(9,9,11,0.92), rgba(9,9,11,0.72))',
          }}
        />

        <div
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: '72px',
          }}
        >
          {/* 다운로드한 이미지는 링크와 떨어져 돌아다닌다(스토리·리포스트) — 보낸 사람
              정보가 없으므로 누구 카드인지 이미지 안에 있어야 한다. 제목 줄을 늘리는
              대신 헤더 문구에 넣어 76px 타이틀이 계속 주인공이게 둔다. */}
          <div style={{ display: 'flex', color: '#a1a1aa', fontSize: 26 }}>
            {card?.nickname ? (
              <>
                {/* 카드와 같은 강조. 다만 굵기는 안 준다 — 이 이미지엔 Medium 한 벌만
                    싣고 있어서 bold 를 요청해도 같은 자소가 나온다(파일만 1.5MB 늘 뿐). */}
                <span style={{ color: '#a78bfa' }}>{card.nickname}</span>
                <span>님의 취향 리포트</span>
              </>
            ) : (
              '겜믈리에 취향 리포트'
            )}
          </div>

          <div
            style={{
              display: 'flex',
              color: '#ffffff',
              fontSize: 76,
              marginTop: 18,
            }}
          >
            {title}
          </div>

          <div
            style={{ display: 'flex', flexDirection: 'column', marginTop: 36 }}
          >
            {genres.map((g) => (
              <div
                key={g.name}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  marginBottom: 18,
                  width: 520,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    color: '#e4e4e7',
                    fontSize: 28,
                  }}
                >
                  <span>{g.name}</span>
                  <span style={{ color: '#a78bfa' }}>
                    {Math.round(g.share * 100)}%
                  </span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    marginTop: 10,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: 'rgba(255,255,255,0.15)',
                  }}
                >
                  <div
                    style={{
                      width: `${Math.round(g.share * 100)}%`,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: '#8b5cf6',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', marginTop: 18 }}>
            {tags.map((t) => (
              <div
                key={t}
                style={{
                  display: 'flex',
                  marginRight: 12,
                  padding: '8px 20px',
                  borderRadius: 999,
                  border: '2px solid rgba(34,211,238,0.4)',
                  backgroundColor: 'rgba(34,211,238,0.12)',
                  color: '#22d3ee',
                  fontSize: 26,
                }}
              >
                {t}
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: 'Pretendard', data: await loadFont(), style: 'normal' }],
    },
  );
}
