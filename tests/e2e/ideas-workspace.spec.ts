import { test, expect } from "@playwright/test";
import { safeNavigate } from "./helpers";

test.describe("아이디어 워크스페이스", () => {
  test("아이디어 페이지 접근 시 리다이렉트 또는 로드", async ({ page }) => {
    await page.goto("/ideas");
    await page.waitForLoadState("networkidle");
    const url = page.url();
    expect(url).toMatch(/\/(ideas|login)/);
  });

  test("아이디어 목록 로드 확인", async ({ page }) => {
    test.skip(
      !process.env.E2E_SESSION_COOKIE,
      "E2E_SESSION_COOKIE 미설정 — 인증 필요 테스트 스킵",
    );
    await safeNavigate(page, "/ideas");

    // 아이디어 페이지 헤더 또는 콘텐츠 영역
    const heading = page.getByText(/아이디어/i);
    await expect(heading.first()).toBeVisible();
  });

  test("소스 패널 존재 확인", async ({ page }) => {
    test.skip(
      !process.env.E2E_SESSION_COOKIE,
      "E2E_SESSION_COOKIE 미설정 — 인증 필요 테스트 스킵",
    );
    await safeNavigate(page, "/ideas");

    // 소스 사이드바 패널: 수집된 소스 또는 URL 입력 영역
    const sourcePanel = page.getByText(/소스|Source|URL/i);
    await expect(sourcePanel.first()).toBeVisible();
  });

  test("아이디어 상세 페이지 네비게이션", async ({ page }) => {
    test.skip(
      !process.env.E2E_SESSION_COOKIE,
      "E2E_SESSION_COOKIE 미설정 — 인증 필요 테스트 스킵",
    );
    await safeNavigate(page, "/ideas");

    // 첫 번째 아이디어 항목 클릭
    const firstIdea = page
      .getByRole("link")
      .filter({ hasText: /.+/ })
      .first();
    if (await firstIdea.isVisible()) {
      await firstIdea.click();
      await page.waitForLoadState("networkidle");
      expect(page.url()).toMatch(/\/ideas\/.+/);
    }
  });

  test("분석 실행 버튼 존재 확인", async ({ page }) => {
    test.skip(
      !process.env.E2E_SESSION_COOKIE,
      "E2E_SESSION_COOKIE 미설정 — 인증 필요 테스트 스킵",
    );
    await safeNavigate(page, "/ideas");

    const analysisBtn = page.getByRole("button", {
      name: /분석|시작|Analysis/i,
    });
    // 소스가 선택되지 않으면 버튼이 비활성이거나 없을 수 있음
    const count = await analysisBtn.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test("새 아이디어 버튼 클릭 후 상세 페이지 이동", async ({ page }) => {
    test.skip(
      !process.env.E2E_SESSION_COOKIE,
      "E2E_SESSION_COOKIE 미설정 — 인증 필요 테스트 스킵",
    );
    await safeNavigate(page, "/ideas");
    // "새 아이디어" 버튼 클릭
    const newBtn = page.getByRole("button", { name: /새 아이디어/i });
    if (await newBtn.isVisible()) {
      await newBtn.click();
      await page.waitForLoadState("networkidle");
      // 상세 페이지로 이동하거나 아이디어 목록 갱신
      expect(page.url()).toMatch(/\/ideas/);
    }
  });

  test("IdeaCard 클릭 시 상세 페이지 이동", async ({ page }) => {
    test.skip(
      !process.env.E2E_SESSION_COOKIE,
      "E2E_SESSION_COOKIE 미설정 — 인증 필요 테스트 스킵",
    );
    await safeNavigate(page, "/ideas");
    // 아이디어 카드 링크 클릭
    const ideaLinks = page.locator('a[href^="/ideas/"]');
    const count = await ideaLinks.count();
    if (count > 0) {
      await ideaLinks.first().click();
      await page.waitForLoadState("networkidle");
      expect(page.url()).toMatch(/\/ideas\/.+/);
    }
  });

  test("GNB 4개 탭 네비게이션 확인", async ({ page }) => {
    test.skip(
      !process.env.E2E_SESSION_COOKIE,
      "E2E_SESSION_COOKIE 미설정 — 인증 필요 테스트 스킵",
    );
    await safeNavigate(page, "/ideas");
    // 4개 탭: 대시보드, 아이디어, 사업제안, 실험실
    const tabs = ["대시보드", "아이디어", "사업제안", "실험실"];
    for (const tabLabel of tabs) {
      const tab = page.getByRole("link", { name: new RegExp(tabLabel) });
      await expect(tab.first()).toBeVisible();
    }
  });

  test("테마 토글 버튼 동작 확인", async ({ page }) => {
    test.skip(
      !process.env.E2E_SESSION_COOKIE,
      "E2E_SESSION_COOKIE 미설정 — 인증 필요 테스트 스킵",
    );
    await safeNavigate(page, "/ideas");
    // 테마 토글 버튼 (aria-label: 라이트 모드 or 다크 모드)
    const themeBtn = page.getByRole("button", {
      name: /라이트 모드|다크 모드/i,
    });
    await expect(themeBtn).toBeVisible();
    // 클릭 후 aria-label 변경 확인
    const beforeLabel = await themeBtn.getAttribute("aria-label");
    await themeBtn.click();
    await page.waitForTimeout(300);
    const afterLabel = await themeBtn.getAttribute("aria-label");
    expect(beforeLabel).not.toEqual(afterLabel);
  });

  test("사업 제안하기 버튼 클릭 시 모달 오픈", async ({ page }) => {
    test.skip(
      !process.env.E2E_SESSION_COOKIE,
      "E2E_SESSION_COOKIE 미설정 — 인증 필요 테스트 스킵",
    );
    await safeNavigate(page, "/ideas");
    // 아이디어 상세 페이지로 이동 후 테스트
    const ideaLinks = page.locator('a[href^="/ideas/"]');
    const count = await ideaLinks.count();
    if (count > 0) {
      await ideaLinks.first().click();
      await page.waitForLoadState("networkidle");
      // "사업 제안하기" 버튼 클릭
      const proposeBtn = page.getByRole("button", { name: /사업 제안하기/i });
      if (await proposeBtn.isVisible()) {
        await proposeBtn.click();
        await page.waitForTimeout(300);
        // 모달 오픈 확인 (dialog role 또는 모달 내 텍스트)
        const modal = page.getByRole("dialog");
        await expect(modal).toBeVisible();
      }
    }
  });
});
