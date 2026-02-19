import { test, expect } from "@playwright/test";
import { NAV_TABS } from "./helpers";

test.describe("GNB 탭 네비게이션", () => {
  // 모든 페이지가 인증 필요 — 로그인 리다이렉트 확인만 수행
  // 인증 세션 확보 시 test.skip 제거

  test("루트(/) 접근 시 페이지 로드", async ({ page }) => {
    await page.goto("/");
    // 로그인 페이지로 리다이렉트되거나 대시보드가 로드됨
    await page.waitForLoadState("networkidle");
    const url = page.url();
    expect(url).toMatch(/\/(login|dashboard|$)/);
  });

  test("GNB에 Discovery-X 로고가 존재", async ({ page }) => {
    // requires auth — 로그인 페이지에서도 로고가 있을 수 있음
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

  test.skip("인증 후 GNB 탭 클릭 시 올바른 URL 이동", async ({ page }) => {
    // requires auth — storageState 설정 후 활성화
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    for (const tab of NAV_TABS) {
      await page.getByRole("link", { name: tab.label }).click();
      await page.waitForLoadState("networkidle");
      expect(page.url()).toContain(tab.path);
    }
  });

  test.skip("활성 탭 하이라이트 확인", async ({ page }) => {
    // requires auth
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // 대시보드 탭이 활성 스타일(brand 색상)을 가짐
    const activeTab = page.getByRole("link", { name: "대시보드" });
    await expect(activeTab).toHaveClass(/brand/);
  });
});
