import { test, expect } from "@playwright/test";

test.describe("사업제안 페이지", () => {
  test("사업제안 목록 접근 시 리다이렉트 또는 로드", async ({ page }) => {
    await page.goto("/proposals");
    await page.waitForLoadState("networkidle");
    const url = page.url();
    expect(url).toMatch(/\/(proposals|login)/);
  });

  test.skip("사업제안 목록 페이지 로드 확인", async ({ page }) => {
    // requires auth
    await page.goto("/proposals");
    await page.waitForLoadState("networkidle");

    // PipelineView 또는 CategoryCardRow 렌더링
    const heading = page.getByText(/사업제안|Proposal/i);
    await expect(heading.first()).toBeVisible();
  });

  test.skip("새 사업제안 생성 페이지 접근", async ({ page }) => {
    // requires auth
    await page.goto("/proposals/new");
    await page.waitForLoadState("networkidle");

    expect(page.url()).toContain("/proposals/new");
    // 사업제안 작성 폼 요소 확인
    const titleInput = page.getByLabel(/제목|Title/i);
    await expect(titleInput).toBeVisible();
  });

  test.skip("사업제안 상세 페이지 네비게이션", async ({ page }) => {
    // requires auth
    await page.goto("/proposals");
    await page.waitForLoadState("networkidle");

    // 목록에서 첫 번째 사업제안 클릭
    const firstProposal = page.getByRole("link").filter({ hasText: /.+/ }).first();
    if (await firstProposal.isVisible()) {
      await firstProposal.click();
      await page.waitForLoadState("networkidle");
      expect(page.url()).toMatch(/\/proposals\/.+/);
    }
  });

  test.skip("사업제안 상세 — 마일스톤/댓글 섹션 존재", async ({ page }) => {
    // requires auth — 사업제안 상세 페이지에 마일스톤/댓글 탭 포함
    await page.goto("/proposals");
    await page.waitForLoadState("networkidle");

    const firstProposal = page.getByRole("link").filter({ hasText: /.+/ }).first();
    if (await firstProposal.isVisible()) {
      await firstProposal.click();
      await page.waitForLoadState("networkidle");

      // ProposalTabNav: 마일스톤/댓글 등 탭 확인
      const tabs = page.getByText(/마일스톤|댓글|Milestone|Comment/i);
      await expect(tabs.first()).toBeVisible();
    }
  });

  test("사업제안 하위 라우트 — /proposals/completed 접근", async ({ page }) => {
    await page.goto("/proposals/completed");
    await page.waitForLoadState("networkidle");
    const url = page.url();
    expect(url).toMatch(/\/(proposals\/completed|login)/);
  });
});
