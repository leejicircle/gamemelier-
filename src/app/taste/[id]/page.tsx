import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { fetchTasteCard, tasteTitle } from '@/lib/tasteCard';
import { TasteCardView } from './TasteCardView';

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

  return (
    <div className="container-fluid flex justify-center">
      <div className="w-full max-w-md">
        <TasteCardView card={card} userId={id} />

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
