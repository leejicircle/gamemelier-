import Image from 'next/image';
import { Crown } from 'lucide-react';

import type { TasteCard } from '@/lib/tasteCard';
import { tasteTitle } from '@/lib/tasteCard';
import ShareActions from './ShareActions';

/**
 * 취향 카드 본체. `/taste/[id]` 페이지와 추천 탭 팝업이 같은 마크업을 쓴다
 * (공유된 링크로 들어온 사람과 앱 안에서 본 사람이 같은 걸 봐야 한다).
 */
export function TasteCardView({
  card,
  userId,
}: {
  card: TasteCard;
  userId: string;
}) {
  const title = tasteTitle(card.genres[0]?.name);

  return (
    // 테두리가 gray-800 이면 어두운 배경(팝업 오버레이·다크 페이지)에 묻혀 카드 경계가 사라진다.
    // 배경색이 뭐가 오든 뜨는 white/15 + 그림자로 "떠 있는 표면"을 만든다.
    <div className="relative overflow-hidden rounded-xl border border-white/15 bg-gray-950 shadow-2xl">
      {card.gameImage && (
        <>
          <Image
            src={card.gameImage}
            alt=""
            fill
            sizes="448px"
            className="object-cover"
          />
          {/* 게임 아트마다 밝기가 달라 고정 오버레이 하나로는 위험 — 어떤 아트가 와도
              흰 글씨가 읽히도록 세로 그라디언트로 깐다. */}
          <div className="absolute inset-0 bg-gradient-to-b from-gray-950/92 via-gray-950/88 to-gray-950/76" />
        </>
      )}

      <div className="relative p-6">
        <div className="mb-5 flex items-center gap-1.5">
          <Crown size={16} className="text-purple2" />
          <span className="text-xs text-gray-400">겜믈리에 취향 리포트</span>
        </div>

        {card.genres.length === 0 ? (
          <p className="mb-6 text-sm text-gray-300">
            아직 취향 데이터가 없어요. 게임을 저장하면 카드가 만들어져요.
          </p>
        ) : (
          <>
            <p className="mb-1 text-sm text-gray-400">당신은</p>
            <h2 className="mb-1.5 text-2xl leading-snug font-medium text-white">
              {title}
            </h2>
            {card.gameName && (
              <p className="mb-5 text-xs text-gray-400">{card.gameName}</p>
            )}

            <div className="mb-5 flex flex-col gap-2.5">
              {card.genres.map((g) => (
                <div key={g.name}>
                  <div className="mb-1 flex justify-between text-xs text-gray-200">
                    <span>{g.name}</span>
                    <span className="text-purple2">
                      {Math.round(g.share * 100)}%
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/15">
                    <div
                      className="bg-purple2 h-1.5 rounded-full"
                      style={{ width: `${Math.round(g.share * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {card.tags.length > 0 && (
              <div className="mb-6 flex flex-wrap gap-1.5">
                {card.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-full border border-cyan-400/40 bg-cyan-400/10 px-2.5 py-0.5 text-xs text-cyan-300"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
          </>
        )}

        <ShareActions title={title} userId={userId} />
      </div>
    </div>
  );
}
