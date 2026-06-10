import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E 설정.
 *
 * 실행 방식: webServer 가 `next build && next start` 로 앱을 직접 띄우고
 *   localhost:3000 을 테스트한다. 로컬/CI 동일하게 동작하며 외부 배포가 필요 없다.
 *   (CI 에서는 NEXT_PUBLIC_SUPABASE_URL / ANON_KEY 환경변수가 빌드에 주입돼야 함 —
 *    .github/workflows/playwright.yml 참조)
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // CI 에서 실수로 test.only 가 남으면 실패시켜 누락 방지
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build && npm run start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
