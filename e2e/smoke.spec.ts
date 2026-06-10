import { test, expect } from '@playwright/test';

/**
 * 읽기 전용 스모크 테스트 (초기 골격).
 *
 * 주의: 셀렉터는 현재 마크업 추정에 기반한다. 첫 CI 실행 후 실제 DOM 에 맞게
 *   다듬는 것을 전제로 한 출발점이다. 로그인/찜/구매처럼 계정·데이터 변경이
 *   필요한 플로우는 테스트 계정 준비 후 별도 파일로 추가한다.
 */

test('홈페이지가 정상 로드된다', async ({ page }) => {
  const res = await page.goto('/');
  expect(res?.ok()).toBeTruthy();
  await expect(page).toHaveTitle(/.+/); // 타이틀이 비어있지 않음
});

test('게임 목록 페이지에 카드가 렌더된다', async ({ page }) => {
  await page.goto('/games');
  // 게임 카드는 /games/[id] 로 가는 링크를 가진다고 가정
  const cards = page.locator('a[href^="/games/"]');
  await expect(cards.first()).toBeVisible({ timeout: 15_000 });
});

test('게임 목록에서 상세 페이지로 이동한다', async ({ page }) => {
  await page.goto('/games');
  await page.locator('a[href^="/games/"]').first().click();
  await expect(page).toHaveURL(/\/games\/\d+/);
});

test('출시예정 페이지가 정상 로드된다', async ({ page }) => {
  const res = await page.goto('/upcoming');
  expect(res?.ok()).toBeTruthy();
});

test('로그인 페이지에 입력 폼이 있다', async ({ page }) => {
  await page.goto('/login');
  await expect(page.locator('input').first()).toBeVisible();
});
