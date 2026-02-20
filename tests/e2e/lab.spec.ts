import { test, expect } from "@playwright/test";
import { LAB_TABS, safeNavigate } from "./helpers";

test.describe("실험실 페이지", () => {
  test("실험실 경로 접근 시 리다이렉트 또는 로드", async ({ page }) => {
    await page.goto("/lab");
    await page.waitForLoadState("networkidle");
    const url = page.url();
    expect(url).toMatch(/\/(lab|login)/);
  });

  test("실험실 5탭 네비게이션 확인", async ({ page }) => {
    test.skip(
      !process.env.E2E_SESSION_COOKIE,
      "E2E_SESSION_COOKIE 미설정 — 인증 필요 테스트 스킵",
    );
    await safeNavigate(page, "/lab");

    for (const tab of LAB_TABS) {
      const tabLink = page.getByRole("link", { name: tab.label });
      await expect(tabLink).toBeVisible();
    }
  });

  test("실험실 탭 클릭 시 올바른 URL 이동", async ({ page }) => {
    test.skip(
      !process.env.E2E_SESSION_COOKIE,
      "E2E_SESSION_COOKIE 미설정 — 인증 필요 테스트 스킵",
    );
    await safeNavigate(page, "/lab");

    for (const tab of LAB_TABS) {
      await page.getByRole("link", { name: tab.label }).click();
      await page.waitForLoadState("networkidle");
      expect(page.url()).toContain(tab.path);
    }
  });

  test("실험실 헤더 텍스트 확인", async ({ page }) => {
    test.skip(
      !process.env.E2E_SESSION_COOKIE,
      "E2E_SESSION_COOKIE 미설정 — 인증 필요 테스트 스킵",
    );
    await safeNavigate(page, "/lab");

    // lab.tsx에 "실험실" h1 + "Knowledge Graph Intelligence Laboratory" 부제
    await expect(
      page.getByRole("heading", { name: /실험실/i }),
    ).toBeVisible();
    await expect(
      page.getByText(/Knowledge Graph Intelligence Laboratory/i),
    ).toBeVisible();
  });

  test("매트릭스 경로 접근", async ({ page }) => {
    await page.goto("/lab/matrix");
    await page.waitForLoadState("networkidle");
    const url = page.url();
    expect(url).toMatch(/\/(lab\/matrix|login)/);
  });

  test("매트릭스 — 히트맵 그리드 존재 확인", async ({ page }) => {
    test.skip(
      !process.env.E2E_SESSION_COOKIE,
      "E2E_SESSION_COOKIE 미설정 — 인증 필요 테스트 스킵",
    );
    await safeNavigate(page, "/lab/matrix");

    // HeatmapGrid 또는 HeatmapLegend 관련 요소
    const grid = page.getByText(/매트릭스|Matrix|히트맵|Heatmap/i);
    await expect(grid.first()).toBeVisible();
  });

  test("분석 경로 접근", async ({ page }) => {
    await page.goto("/lab/analysis");
    await page.waitForLoadState("networkidle");
    const url = page.url();
    expect(url).toMatch(/\/(lab\/analysis|login)/);
  });

  test("방법론 경로 접근", async ({ page }) => {
    await page.goto("/lab/methods");
    await page.waitForLoadState("networkidle");
    const url = page.url();
    expect(url).toMatch(/\/(lab\/methods|login)/);
  });
});
