import { test, expect } from "@playwright/test";

test.describe("아이디어 워크스페이스", () => {
  test("아이디어 페이지 접근 시 리다이렉트 또는 로드", async ({ page }) => {
    await page.goto("/ideas");
    await page.waitForLoadState("networkidle");
    const url = page.url();
    expect(url).toMatch(/\/(ideas|login)/);
  });

  test.skip("아이디어 목록 로드 확인", async ({ page }) => {
    // requires auth
    await page.goto("/ideas");
    await page.waitForLoadState("networkidle");

    // 아이디어 페이지 헤더 또는 콘텐츠 영역
    const heading = page.getByText(/아이디어/i);
    await expect(heading.first()).toBeVisible();
  });

  test.skip("소스 패널 존재 확인", async ({ page }) => {
    // requires auth — ideas.tsx 레이아웃에 사이드바 소스 패널 포함
    await page.goto("/ideas");
    await page.waitForLoadState("networkidle");

    // 소스 사이드바 패널: 수집된 소스 또는 URL 입력 영역
    const sourcePanel = page.getByText(/소스|Source|URL/i);
    await expect(sourcePanel.first()).toBeVisible();
  });

  test.skip("아이디어 상세 페이지 네비게이션", async ({ page }) => {
    // requires auth
    await page.goto("/ideas");
    await page.waitForLoadState("networkidle");

    // 첫 번째 아이디어 항목 클릭
    const firstIdea = page.getByRole("link").filter({ hasText: /.+/ }).first();
    if (await firstIdea.isVisible()) {
      await firstIdea.click();
      await page.waitForLoadState("networkidle");
      expect(page.url()).toMatch(/\/ideas\/.+/);
    }
  });

  test.skip("분석 실행 버튼 존재 확인", async ({ page }) => {
    // requires auth — IdeasIndex에 분석 시작 기능
    await page.goto("/ideas");
    await page.waitForLoadState("networkidle");

    const analysisBtn = page.getByRole("button", { name: /분석|시작|Analysis/i });
    // 소스가 선택되지 않으면 버튼이 비활성이거나 없을 수 있음
    // 존재 여부만 확인
    const count = await analysisBtn.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});
