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
  const { data: card, isLoading } = useTasteCard(userId, open);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* 카드가 자체 테두리·배경·그림자를 갖고 있어 다이얼로그 크롬은 지운다(이중 테두리 방지).
          닫기 X 는 카드 아트 위에 얹히므로 흰색으로 고정해 어떤 아트에서도 보이게 한다. */}
      <DialogContent className="border-0 bg-transparent p-0 shadow-none sm:max-w-md [&>[data-slot=dialog-close]]:top-5 [&>[data-slot=dialog-close]]:right-5 [&>[data-slot=dialog-close]]:cursor-pointer [&>[data-slot=dialog-close]]:text-white [&>[data-slot=dialog-close]]:opacity-80">
        <DialogHeader className="sr-only">
          <DialogTitle>내 취향 카드</DialogTitle>
          <DialogDescription>
            내 취향을 요약한 카드입니다. 공유하거나 이미지로 저장할 수 있어요.
          </DialogDescription>
        </DialogHeader>

        {isLoading || !card || !userId ? (
          <div className="p-6">
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        ) : (
          <TasteCardView card={card} userId={userId} />
        )}
      </DialogContent>
    </Dialog>
  );
}
