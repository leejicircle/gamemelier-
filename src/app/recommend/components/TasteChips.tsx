'use client';

import Link from 'next/link';
import { Crown } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { useTasteChips } from '@/lib/hooks/useTasteChips';
import { useTasteTagChips } from '@/lib/hooks/useTasteTagChips';

/**
 * 취향 칩 — 추천 탭 상단에 본인 취향을 비중과 함께 노출.
 * 장르(큰 바구니) 한 줄 + 세부 태그(세밀한 신호) 한 줄. "왜 이런 추천이 나오는지"
 * 설명 장치. 각 줄은 해당 취향이 없으면 숨김.
 */
export function TasteChips({ userId }: { userId?: string }) {
  const { data: genres = [] } = useTasteChips(userId);
  const { data: tags = [] } = useTasteTagChips(userId);

  if (genres.length === 0 && tags.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 mb-8">
      {genres.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-sm font-medium text-gray-500">내 취향</span>
          {genres.map((chip) => (
            <Badge
              key={chip.genre_id}
              variant="outline"
              className="border-purple2/40 bg-purple2/10 text-purple2 text-sm"
            >
              {chip.name}
              <span className="ml-1 text-gray-400">
                {Math.round(chip.share * 100)}%
              </span>
            </Badge>
          ))}
        </div>
      )}
      {tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-sm font-medium text-gray-500">세부 태그</span>
          {tags.map((chip) => (
            <Badge
              key={chip.tag_id}
              variant="outline"
              className="border-cyan-400/40 bg-cyan-400/10 text-cyan-300 text-sm"
            >
              {chip.name}
              <span className="ml-1 text-gray-400">
                {Math.round(chip.share * 100)}%
              </span>
            </Badge>
          ))}
        </div>
      )}
      {/* 공유 카드 상시 진입점 — 픽커는 취향이 빈 신규 유저에게 1회만 뜨므로
          재방문 유저가 카드를 다시 찾아올 곳이 필요하다. */}
      {userId && (
        <Link
          href={`/taste/${userId}`}
          className="text-purple2 hover:text-purple2/80 mt-1 flex w-fit items-center gap-1 text-sm transition-colors"
        >
          <Crown size={14} />내 취향 카드 보기
        </Link>
      )}
    </div>
  );
}
