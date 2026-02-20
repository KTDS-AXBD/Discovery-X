import { test as setup, expect } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const authFile = path.join(currentDir, ".auth/session.json");

/**
 * E2E 인증 세팅.
 *
 * Google OAuth는 E2E 자동화가 불가하므로,
 * 환경변수 E2E_SESSION_COOKIE에서 세션 쿠키를 주입하여 인증 상태를 생성한다.
 *
 * 사용법: E2E_SESSION_COOKIE=<value> pnpm test:e2e
 */
setup("authenticate", async ({ page }) => {
  const sessionCookie = process.env.E2E_SESSION_COOKIE;

  if (sessionCookie) {
    await page.context().addCookies([
      {
        name: "__session",
        value: sessionCookie,
        domain: "localhost",
        path: "/",
        httpOnly: true,
        secure: false,
        sameSite: "Lax",
      },
    ]);

    // 대시보드 접근으로 세션 유효성 확인
    await page.goto("/dashboard");
    await expect(page).not.toHaveURL(/\/login/);
  } else {
    console.warn(
      "⚠️ E2E_SESSION_COOKIE 환경변수가 설정되지 않았습니다.\n" +
        "인증 필요 테스트는 건너뜁니다.\n" +
        "설정 방법: E2E_SESSION_COOKIE=<value> pnpm test:e2e",
    );
  }

  // 인증 상태 저장
  await page.context().storageState({ path: authFile });
});
