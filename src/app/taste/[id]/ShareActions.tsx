'use client';

import { Share2 } from 'lucide-react';
import { toast } from 'sonner';

/**
 * 공유 = Web Share API(모바일 네이티브 시트) → 미지원이면 클립보드 복사.
 * 이미지 저장은 OG 이미지 URL 을 새 탭으로 여는 것으로 대신한다(캔버스 라이브러리 불필요).
 */
export default function ShareActions({
  title,
  userId,
}: {
  title: string;
  userId: string;
}) {
  async function share() {
    // location.href 를 쓰면 팝업으로 열었을 때 /recommend 가 공유된다 — 카드 URL 을 직접 만든다.
    const url = `${window.location.origin}/taste/${userId}`;
    const text = `내 스팀 취향은 "${title}". 당신은 어떤 유형?`;

    if (navigator.share) {
      try {
        await navigator.share({ title: '겜믈리에 취향 리포트', text, url });
        return;
      } catch {
        return; // 사용자가 취소한 경우 — 조용히 종료
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      toast.success('링크를 복사했어요');
    } catch {
      toast.error('링크 복사에 실패했어요');
    }
  }

  return (
    <div className="flex gap-2">
      <button
        onClick={share}
        className="bg-purple hover:bg-purple2 flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm text-white transition-colors"
      >
        <Share2 size={16} />
        공유하기
      </button>
      <a
        href={`/taste/${userId}/opengraph-image`}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-lg border border-gray-700 px-4 py-2.5 text-sm text-gray-300 transition-colors hover:bg-gray-800"
      >
        이미지 저장
      </a>
    </div>
  );
}
