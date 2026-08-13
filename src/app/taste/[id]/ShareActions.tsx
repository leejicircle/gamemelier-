'use client';

import { Share2 } from 'lucide-react';
import { toast } from 'sonner';

import { markTasteCardShared } from '@/lib/api/tasteApi';

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

    // 공개 전환은 공유 시트가 끝나기 전에 해둔다. 카톡·X 크롤러가 링크를 받자마자
    // OG 이미지를 가져가는데, 그때 아직 비공개면 미리보기가 빈 카드로 굳는다.
    // (시트를 취소해도 공개로 남지만, 깨진 미리보기보다 낫다.)
    void markTasteCardShared();

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
        className="bg-purple hover:bg-purple2 flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm text-white transition-colors"
      >
        <Share2 size={16} />
        공유하기
      </button>
      {/* download 는 동일 오리진에서만 동작하는데 OG 이미지가 같은 오리진이라 그대로 저장된다
          (캔버스 라이브러리 불필요). iOS Safari 는 download 를 무시하고 이미지를 열 수 있는데,
          그 경우 길게 눌러 저장하는 예전 동작으로 떨어질 뿐이라 더 나빠지지 않는다. */}
      <a
        href={`/taste/${userId}/opengraph-image`}
        download="gamemelier-taste-card.png"
        className="flex cursor-pointer items-center rounded-lg border border-gray-700 px-4 py-2.5 text-sm text-gray-300 transition-colors hover:bg-gray-800"
      >
        이미지 저장
      </a>
    </div>
  );
}
