import { test, expect } from "@playwright/test";

test.describe("DEAD_END Flow", () => {
  test("creates discovery, completes experiment, decides DEAD_END", async ({ page }) => {
    // 1. Login
    await page.goto("/");
    await page.getByRole("button", { name: /로그인|Login/i }).first().click();
    await expect(page).toHaveURL(/discoveries/);

    // 2. Create Discovery
    await page.getByRole("link", { name: /새 Discovery|새로 만들기|New/i }).click();
    await page.getByLabel(/제목|Title/i).fill("E2E DEAD_END Discovery");
    await page.getByLabel(/요약|Summary/i).fill("Testing DEAD_END flow");
    await page.locator("select, [name=sourceType]").first().selectOption("internal_pain");
    await page.getByRole("button", { name: /생성|만들기|Create|Submit/i }).click();

    // 3. Promote to OPEN
    await page.getByRole("link", { name: /OPEN으로 승격|Promote|승격/i }).click();
    await page.locator("select, [name=ownerId]").first().selectOption({ index: 1 });
    await page.getByLabel(/가설|Hypothesis/i).fill("DEAD_END hypothesis");
    await page.getByLabel(/최소 행동|Minimal Action/i).fill("DEAD_END action");
    await page.getByLabel(/예상 근거|Expected Evidence/i).fill("DEAD_END evidence");
    await page.getByRole("button", { name: /승격|Promote|확인|Submit/i }).click();

    // 4. Decide DEAD_END
    await page.getByRole("link", { name: /DEAD_END|중단/i }).click();
    await page.getByLabel(/결정 근거|Rationale/i).fill("No user demand found");

    // Select failure pattern(s)
    const patternCheckboxes = page.locator("input[type=checkbox], [name*=failurePattern]");
    if (await patternCheckboxes.count() > 0) {
      await patternCheckboxes.first().check();
    }

    await page.getByLabel(/증거.*사유|Evidence Reason/i).fill("User interviews showed zero interest");
    await page.getByRole("button", { name: /결정|Decide|확인|Submit/i }).click();

    await expect(page.getByText("DEAD_END")).toBeVisible();
  });
});
