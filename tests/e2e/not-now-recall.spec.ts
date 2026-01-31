import { test, expect } from "@playwright/test";

test.describe("NOT_NOW + Recall Queue", () => {
  test("creates discovery, decides NOT_NOW, appears in Recall Queue", async ({ page }) => {
    // 1. Login
    await page.goto("/");
    await page.getByRole("button", { name: /로그인|Login/i }).first().click();
    await expect(page).toHaveURL(/discoveries/);

    // 2. Create Discovery
    await page.getByRole("link", { name: /새 Discovery|새로 만들기|New/i }).click();
    await page.getByLabel(/제목|Title/i).fill("E2E NOT_NOW Discovery");
    await page.getByLabel(/요약|Summary/i).fill("Testing NOT_NOW flow");
    await page.locator("select, [name=sourceType]").first().selectOption("issue");
    await page.getByRole("button", { name: /생성|만들기|Create|Submit/i }).click();

    // 3. Promote to OPEN
    await page.getByRole("link", { name: /OPEN으로 승격|Promote|승격/i }).click();
    await page.locator("select, [name=ownerId]").first().selectOption({ index: 1 });
    await page.getByLabel(/가설|Hypothesis/i).fill("NOT_NOW hypothesis");
    await page.getByLabel(/최소 행동|Minimal Action/i).fill("NOT_NOW action");
    await page.getByLabel(/예상 근거|Expected Evidence/i).fill("NOT_NOW evidence");
    await page.getByRole("button", { name: /승격|Promote|확인|Submit/i }).click();

    // 4. Decide NOT_NOW
    await page.getByRole("link", { name: /NOT_NOW|보류/i }).click();
    await page.getByLabel(/결정 근거|Rationale/i).fill("Market not ready yet");
    await page.locator("select, [name=notNowTriggerType]").first().selectOption("Technology_Maturity");
    await page.getByLabel(/트리거 조건|Trigger Condition/i).fill("When technology matures");
    await page.getByLabel(/재검토 날짜|Revisit Date/i).fill("2026-03-01");
    await page.getByRole("button", { name: /결정|Decide|확인|Submit/i }).click();

    await expect(page.getByText("NOT_NOW")).toBeVisible();

    // 5. Check Recall Queue
    await page.getByRole("link", { name: /Recall/i }).click();
    await expect(page).toHaveURL(/recall/);
  });
});
