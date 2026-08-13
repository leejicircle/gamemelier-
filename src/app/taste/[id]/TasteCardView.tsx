import Image from 'next/image';
import { Crown } from 'lucide-react';

import { tasteTitle, type TasteCard } from '@/lib/tasteLabel';
import ShareActions from './ShareActions';

/**
 * 취향 카드 본체. `/taste/[id]` 페이지와 추천 탭 팝업이 같은 마크업을 쓴다
 * (공유된 링크로 들어온 사람과 앱 안에서 본 사람이 같은 걸 봐야 한다).
 */
export function TasteCardView({
  card,
  userId,
  isOwner = false,
}: {
  card: TasteCard;
  userId: string;
  /** 본인 카드인지. 공유 버튼 노출·공개 전환은 본인일 때만. */
  isOwner?: boolean;
}) {
  const title = tasteTitle(card.genres[0]?.name);

  // 공유하지 않은 남의 카드 — 서버가 내용을 주지 않는다.
  if (!card.visible) {
    return (
      <div className="overflow-hidden rounded-xl border border-white/15 bg-gray-900 p-6">
        <div className="mb-3 flex items-center gap-1.5">
          <Crown size={16} className="text-purple2" />
          <span className="text-xs text-gray-400">겜믈리에 취향 리포트</span>
        </div>
        <p className="text-sm text-gray-300">비공개 카드예요.</p>
      </div>
    );
  }

  return (
    // 면이 페이지(gray-950)보다 한 단계 밝아 카드가 선이 아니라 면으로 구분된다.
    <div className="overflow-hidden rounded-xl border border-white/15 bg-gray-900">
      {/* 아트는 상단 밴드로만 둔다. 풀블리드로 깔면 글자 밑에 어떤 밝기의 아트가 올지
          모르는 채로 스크림 하나에 기대야 하는데(1,800개 카탈로그), 밴드는 글자가
          아트 위에 아예 안 올라가서 그 문제 자체가 없어진다. */}
      {card.gameImage && (
        <div className="relative h-36 w-full">
          <Image
            src={card.gameImage}
            alt=""
            fill
            sizes="448px"
            className="object-cover"
          />
        </div>
      )}

      <div className="p-6">
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
            {/* 닉네임 강조는 CardsGrid 제목("test6님을 위한 추천 게임")과 같은 처리 */}
            <p className="mb-1 text-sm text-gray-400">
              {card.nickname ? (
                <>
                  <span className="text-purple2 font-bold">
                    {card.nickname}
                  </span>
                  님은
                </>
              ) : (
                '당신은'
              )}
            </p>
            <h2 className="mb-1.5 text-2xl leading-snug font-medium text-white">
              {title}
            </h2>
            {card.gameName && (
              <p className="mb-5 text-xs text-gray-400">
                최근 저장 · {card.gameName}
              </p>
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

        {isOwner && (
          <ShareActions title={title} userId={userId} shared={card.shared} />
        )}
      </div>
    </div>
  );
}
