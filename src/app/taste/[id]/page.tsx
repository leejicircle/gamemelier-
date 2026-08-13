import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { fetchTasteCardAsViewer } from '@/lib/tasteCard';
import { tasteTitle } from '@/lib/tasteLabel';
import { TasteCardView } from './TasteCardView';

export async function generateMetadata(props: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await props.params;
  const { card } = await fetchTasteCardAsViewer(id);
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

  // 남의 카드를 보다가 공유를 누르면 호출자 본인 카드가 공개돼버린다 —
  // 공유 버튼은 본인일 때만 띄운다(isOwner).
  const { card, isOwner } = await fetchTasteCardAsViewer(id);
  if (!card) notFound();

  return (
    <div className="container-fluid flex justify-center">
      <div className="w-full max-w-md">
        <TasteCardView card={card} userId={id} isOwner={isOwner} />

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
