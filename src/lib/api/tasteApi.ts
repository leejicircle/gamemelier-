import { supabase } from '@/lib/supabase/client';

/**
 * 취향 카드 공개 여부 전환(set_taste_card_shared RPC). 공유 버튼을 누른 유저만
 * 남에게 카드가 보인다 — 그 전까지는 본인만 볼 수 있다.
 *
 * 반드시 "본인 카드일 때만" 호출할 것. RPC 는 auth.uid() 기준이라 남의 카드를 보다가
 * 호출하면 엉뚱하게 호출자 본인의 카드가 바뀐다(호출부에서 isOwner 로 막는다).
 */
export async function setTasteCardShared(shared: boolean) {
  const { error } = await supabase.rpc('set_taste_card_shared', {
    p_shared: shared,
  });
  if (error) {
    console.error('set_taste_card_shared 실패:', error.message);
    throw error;
  }
}
