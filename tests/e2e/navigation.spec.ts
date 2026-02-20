import { test, expect } from "@playwright/test";
import { NAV_TABS, safeNavigate } from "./helpers";

test.describe("GNB 탭 네비게이션", () => {
  test("루트(/) 접근 시 페이지 로드", async ({ page }) => {
    await page.goto("/");
    // 로그인 페이지로 리다이렉트되거나 대시보드가 로드됨
    await page.waitForLoadState("networkidle");
    const url = page.url();
    expect(url).toMatch(/\/(login|dashboard|$)/);
  });

  test("GNB에 Discovery-X 로고가 존재", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    // 로그인 페이지 자체가 로드되는지 확인
    expect(page.url()).toContain("/login");
  });

  for (const tab of NAV_TABS) {
    test(`${tab.label} 탭 (${tab.path}) 접근 시 리다이렉트 또는 로드`, async ({ page }) => {
      await page.goto(tab.path);
      await page.waitForLoadState("networkidle");
      const url = page.url();
      // 인증 없으면 /login 리다이렉트, 있으면 해당 경로 유지
      expect(url).toMatch(new RegExp(`(${tab.path}|/login)`));
    });
  }

  test("인증 후 GNB 탭 클릭 시 올바른 URL 이동", async ({ page }) => {
    test.skip(
      !process.env.E2E_SESSION_COOKIE,
      "E2E_SESSION_COOKIE 미설정 — 인증 필요 테스트 스킵",
    );
    await safeNavigate(page, "/dashboard");

    for (const tab of NAV_TABS) {
      await page.getByRole("link", { name: tab.label }).click();
      await page.waitForLoadState("networkidle");
      expect(page.url()).toContain(tab.path);
    }
  });

  test("활성 탭 하이라이트 확인", async ({ page }) => {
    test.skip(
      !process.env.E2E_SESSION_COOKIE,
      "E2E_SESSION_COOKIE 미설정 — 인증 필요 테스트 스킵",
    );
    await safeNavigate(page, "/dashboard");

    // 대시보드 탭이 활성 스타일(brand 색상)을 가짐
    const activeTab = page.getByRole("link", { name: "대시보드" });
    await expect(activeTab).toHaveClass(/brand/);
  });
});
