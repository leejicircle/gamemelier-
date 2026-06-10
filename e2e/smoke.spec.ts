import { test, expect } from '@playwright/test';

/**
 * 스모크 테스트 — 핵심 페이지가 서버 에러 없이 정상 응답하는지 확인한다.
 *
 * v1은 의도적으로 "페이지 헬스체크"에 집중한다. 셀렉터 기반 상호작용 테스트
 * (카드 클릭 → 상세 이동, 폼 입력 등)는 실제 마크업을 확인한 뒤 별도로 추가한다.
 * 이 단순 스모크만으로도 SSR 크래시 · 빌드 깨짐 · 라우트 500 같은 실제 회귀를
 * 잡아낸다 (실제로 topsellers 상대경로 SSR 버그를 이 게이트가 잡았음).
 */
const PAGES = [
  { name: '홈', path: '/' },
  { name: '게임 목록', path: '/games' },
  { name: '출시예정', path: '/upcoming' },
  { name: '로그인', path: '/login' },
  { name: '회원가입', path: '/signup' },
];

for (const p of PAGES) {
  test(`${p.name} 페이지가 정상 응답한다`, async ({ page }) => {
    const res = await page.goto(p.path);
    expect(res?.ok(), `${p.path} 응답이 2xx 여야 함`).toBeTruthy();
    await expect(page.locator('body')).toBeVisible();
  });
}
