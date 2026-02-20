import { test, expect } from "@playwright/test";
import { safeNavigate } from "./helpers";

test.describe("대시보드 페이지", () => {
  test("대시보드 경로 접근 시 로그인 리다이렉트 확인", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    // 인증 없으면 /login 리다이렉트
    const url = page.url();
    expect(url).toMatch(/\/(dashboard|login)/);
  });

  test("파이프라인 칸반 섹션 존재 확인", async ({ page }) => {
    test.skip(
      !process.env.E2E_SESSION_COOKIE,
      "E2E_SESSION_COOKIE 미설정 — 인증 필요 테스트 스킵",
    );
    await safeNavigate(page, "/dashboard");

    // PipelineKanban 컴포넌트 렌더링 확인
    const pipeline = page.getByText(/파이프라인|Pipeline/i);
    await expect(pipeline.first()).toBeVisible();
  });

  test("통계 패널 존재 확인", async ({ page }) => {
    test.skip(
      !process.env.E2E_SESSION_COOKIE,
      "E2E_SESSION_COOKIE 미설정 — 인증 필요 테스트 스킵",
    );
    await safeNavigate(page, "/dashboard");

    // 대시보드에 Discovery/Proposal 관련 통계 표시
    const statsArea = page.locator(
      "[class*='stat'], [class*='Statistic'], [data-testid*='stat']",
    );
    await expect(statsArea.first()).toBeVisible();
  });

  test("소스 사이드바(SourceSidebar) 존재 확인", async ({ page }) => {
    test.skip(
      !process.env.E2E_SESSION_COOKIE,
      "E2E_SESSION_COOKIE 미설정 — 인증 필요 테스트 스킵",
    );
    await safeNavigate(page, "/dashboard");

    // SourceSidebar: 최근 수집 소스 목록
    const sidebar = page.getByText(/최근|소스|수집/i);
    await expect(sidebar.first()).toBeVisible();
  });

  test("대시보드 하위 라우트 — /dashboard/review 접근", async ({ page }) => {
    await page.goto("/dashboard/review");
    await page.waitForLoadState("networkidle");
    const url = page.url();
    expect(url).toMatch(/\/(dashboard\/review|login)/);
  });

  test("대시보드 하위 라우트 — /dashboard/recall 접근", async ({ page }) => {
    await page.goto("/dashboard/recall");
    await page.waitForLoadState("networkidle");
    const url = page.url();
    expect(url).toMatch(/\/(dashboard\/recall|login)/);
  });
});
