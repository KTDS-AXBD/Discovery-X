import { test, expect } from "@playwright/test";
import { skipIfNoAuth, safeNavigate } from "./helpers";

test.describe("Extension Workflow", () => {
  skipIfNoAuth(test);

  test("adds 2 experiments, requests extension, adds 3rd experiment", async ({ page }) => {
    // 1. 대시보드 접근 (storageState로 인증 처리됨)
    await safeNavigate(page, "/dashboard");

    // 2. Create Discovery
    await page.getByRole("link", { name: /새 Discovery|새로 만들기|New/i }).click();
    await page.getByLabel(/제목|Title/i).fill("E2E Extension Discovery");
    await page.getByLabel(/요약|Summary/i).fill("Testing extension flow");
    await page.locator("select, [name=sourceType]").first().selectOption("meeting_note");
    await page.getByRole("button", { name: /생성|만들기|Create|Submit/i }).click();

    // 3. Promote to OPEN (creates 1st experiment)
    await page.getByRole("link", { name: /OPEN으로 승격|Promote|승격/i }).click();
    await page.locator("select, [name=ownerId]").first().selectOption({ index: 1 });
    await page.getByLabel(/가설|Hypothesis/i).fill("Extension hypothesis 1");
    await page.getByLabel(/최소 행동|Minimal Action/i).fill("Extension action 1");
    await page.getByLabel(/예상 근거|Expected Evidence/i).fill("Extension evidence 1");
    await page.getByRole("button", { name: /승격|Promote|확인|Submit/i }).click();

    await expect(page.getByText("OPEN")).toBeVisible();

    // 4. Add 2nd experiment
    await page.getByRole("link", { name: /실험 추가|Add Experiment/i }).click();
    await page.getByLabel(/가설|Hypothesis/i).fill("Extension hypothesis 2");
    await page.getByLabel(/최소 행동|Minimal Action/i).fill("Extension action 2");
    await page.getByLabel(/예상 근거|Expected Evidence/i).fill("Extension evidence 2");
    await page.getByRole("button", { name: /추가|Add|Submit/i }).click();

    // 5. Request Extension
    await page.getByRole("link", { name: /연장.*요청|Extension/i }).click();
    await page.getByLabel(/연장 사유|Extension Rationale/i).fill("Need more experiments to validate");
    await page.getByRole("button", { name: /요청|Request|Submit/i }).click();

    await expect(page.getByText(/EXTENSION/i)).toBeVisible();

    // 6. Add 3rd experiment (allowed after extension)
    await page.getByRole("link", { name: /실험 추가|Add Experiment/i }).click();
    await page.getByLabel(/가설|Hypothesis/i).fill("Extension hypothesis 3");
    await page.getByLabel(/최소 행동|Minimal Action/i).fill("Extension action 3");
    await page.getByLabel(/예상 근거|Expected Evidence/i).fill("Extension evidence 3");
    await page.getByRole("button", { name: /추가|Add|Submit/i }).click();

    // Verify 3rd experiment was added
    await expect(page.getByText("Extension hypothesis 3")).toBeVisible();
  });
});
