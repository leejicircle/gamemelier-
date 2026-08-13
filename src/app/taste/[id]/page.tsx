import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Crown } from 'lucide-react';
import { fetchTasteCard, tasteTitle } from '@/lib/tasteCard';
import ShareActions from './ShareActions';

export async function generateMetadata(props: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await props.params;
  const card = await fetchTasteCard(id);
  const title = tasteTitle(card?.genres[0]?.name);

  return {
    title: `${title} — 겜믈리에`,
    description: '내 스팀 취향을 분석했어요. 당신은 어떤 유형?',
  };
}

export default async function TasteCardPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const card = await fetchTasteCard(id);
  if (!card) notFound();

  const title = tasteTitle(card.genres[0]?.name);
  const isEmpty = card.genres.length === 0;

  return (
    <div className="container-fluid flex justify-center">
      <div className="w-full max-w-md">
        <div className="border-gray-800 relative overflow-hidden rounded-xl border bg-gray-950">
          {card.gameImage && (
            <>
              <Image
                src={card.gameImage}
                alt=""
                fill
                sizes="448px"
                className="object-cover"
              />
              {/* 게임 아트마다 밝기가 달라 어떤 아트가 와도 흰 글씨가 읽히도록 진하게 */}
              <div className="absolute inset-0 bg-gradient-to-b from-gray-950/85 via-gray-950/70 to-gray-950/50" />
            </>
          )}

          <div className="relative p-6">
            <div className="mb-5 flex items-center gap-1.5">
              <Crown size={16} className="text-purple2" />
              <span className="text-xs text-gray-400">겜믈리에 취향 리포트</span>
            </div>

            {isEmpty ? (
              <p className="mb-6 text-sm text-gray-300">
                아직 취향 데이터가 없어요. 게임을 저장하면 카드가 만들어져요.
              </p>
            ) : (
              <>
                <p className="mb-1 text-sm text-gray-400">당신은</p>
                <h1 className="mb-1.5 text-2xl leading-snug font-medium text-white">
                  {title}
                </h1>
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

            <ShareActions title={title} userId={id} />
          </div>
        </div>

        <Link
          href="/recommend"
          className="mt-4 block text-center text-sm text-gray-400 hover:text-white"
        >
          나도 내 취향 알아보기
        </Link>
      </div>
    </div>
  );
}
