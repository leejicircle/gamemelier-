'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useTasteCard } from '@/lib/hooks/useTasteCard';
import { TasteCardView } from '@/app/taste/[id]/TasteCardView';

// 닫기 X 는 카드 상단 아트 위에 얹힌다. 게임마다 아트 밝기가 달라 흰색만으론
// 밝은 아트에서 사라지므로, 어두운 원형 배경을 깔아 어떤 아트에서도 보이게 한다.
const CLOSE_BTN = [
  '[&>[data-slot=dialog-close]]:top-4',
  '[&>[data-slot=dialog-close]]:right-4',
  '[&>[data-slot=dialog-close]]:cursor-pointer',
  '[&>[data-slot=dialog-close]]:rounded-full',
  '[&>[data-slot=dialog-close]]:bg-black/60',
  '[&>[data-slot=dialog-close]]:p-1.5',
  '[&>[data-slot=dialog-close]]:text-white',
  '[&>[data-slot=dialog-close]]:opacity-100',
].join(' ');

/**
 * 취향 카드 팝업 — 추천 탭에서 카드를 보려고 페이지를 떠나지 않게.
 * `/taste/[id]` 라우트는 그대로 남는다(공유 링크와 OG 이미지가 그 URL 을 쓴다).
 */
export function TasteCardDialog({
  userId,
  open,
  onOpenChange,
}: {
  userId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // 열었을 때만 조회한다 — 추천 탭 진입마다 부를 이유가 없다.
  const { data: card, isLoading, isError } = useTasteCard(userId, open);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* 카드가 자체 테두리·배경을 갖고 있어 다이얼로그 크롬은 지운다(이중 테두리 방지). */}
      <DialogContent className={`border-0 bg-transparent p-0 shadow-none sm:max-w-md ${CLOSE_BTN}`}>
        <DialogHeader className="sr-only">
          <DialogTitle>내 취향 카드</DialogTitle>
          <DialogDescription>
            내 취향을 요약한 카드입니다. 공유하거나 이미지로 저장할 수 있어요.
          </DialogDescription>
        </DialogHeader>

        {isError ? (
          <div className="rounded-xl border border-white/15 bg-gray-900 p-6">
            <p className="text-sm text-gray-300">
              카드를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
            </p>
          </div>
        ) : isLoading || !card || !userId ? (
          <div className="p-6">
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        ) : (
          // 이 팝업은 본인 추천 탭에서만 열린다 — 항상 본인 카드.
          <TasteCardView card={card} userId={userId} isOwner />
        )}
      </DialogContent>
    </Dialog>
  );
}
