'use client';

import { Badge } from '@/components/ui/badge';
import { useTasteChips } from '@/lib/hooks/useTasteChips';

/**
 * 취향 칩 — 추천 탭 상단에 본인 장르 취향 상위 3개를 비중과 함께 노출.
 * "왜 이런 추천이 나오는지"를 한눈에 보여주는 설명 장치. 취향이 없으면 숨김.
 */
export function TasteChips({ userId }: { userId?: string }) {
  const { data = [] } = useTasteChips(userId);

  if (data.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 mb-8">
      <span className="mr-1 text-sm font-medium text-gray-500">내 취향</span>
      {data.map((chip) => (
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
  );
}
