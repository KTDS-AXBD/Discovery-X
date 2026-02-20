import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",

  // 전역 타임아웃
  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
    video: process.env.CI ? "on-first-retry" : "off",
    screenshot: "only-on-failure",
  },

  projects: [
    // 인증 세팅 프로젝트
    {
      name: "setup",
      testMatch: /global-setup/,
    },
    // 인증 불필요 테스트 (health check, smoke 등)
    {
      name: "public",
      testMatch: /(health-check|smoke)/,
      use: { ...devices["Desktop Chrome"] },
    },
    // 인증 필요 테스트
    {
      name: "authenticated",
      testIgnore: /(health-check|smoke|global-setup)/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: "tests/e2e/.auth/session.json",
      },
      dependencies: ["setup"],
    },
  ],

  webServer: {
    command: "pnpm dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
  },
});
