import { defineConfig, devices } from "@playwright/test";

const PORT = process.env["PREVIEW_PORT"] ?? "4179";

/**
 * e2e는 항상 production 빌드(`vite preview`)를 상대로 돈다. 개발 서버와 달리
 * service worker·상대 경로·번들 산출물이 실제 배포와 같아야 PWA 검사가 의미 있다.
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    // 학생 크롬북 기본 해상도
    { name: "chromebook", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 768 } } },
  ],
  webServer: {
    command: "pnpm build && pnpm preview",
    url: `http://127.0.0.1:${PORT}`,
    // 교사 핵심어 파일이 있어도 e2e는 예시 핵심어로 돈다 (결정론)
    env: { CODEX_KEYWORDS: "example" },
    // 로컬에서는 이미 떠 있는 preview를 재사용한다(다른 세션이 4173을 점유한 전례가 있어 4179 사용).
    reuseExistingServer: !process.env["CI"],
    timeout: 120_000,
  },
});
