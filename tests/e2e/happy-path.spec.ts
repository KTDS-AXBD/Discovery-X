import { test, expect } from "@playwright/test";
import { skipIfNoAuth, safeNavigate } from "./helpers";

test.describe("Happy Path: Discovery → OPEN → NEXT", () => {
  skipIfNoAuth(test);

  test("creates discovery, promotes to OPEN, adds evidence, decides NEXT", async ({ page }) => {
    // 1. 대시보드 접근 (storageState로 인증 처리됨)
    await safeNavigate(page, "/dashboard");

    // 2. Create Discovery
    await page.getByRole("link", { name: /새 Discovery|새로 만들기|New/i }).click();
    await page.getByLabel(/제목|Title/i).fill("E2E Happy Path Discovery");
    await page.getByLabel(/요약|Summary/i).fill("Testing the full happy path flow");
    await page.locator("select, [name=sourceType]").first().selectOption("article");
    await page.getByRole("button", { name: /생성|만들기|Create|Submit/i }).click();

    // Verify creation
    await expect(page.getByText("E2E Happy Path Discovery")).toBeVisible();

    // 3. Promote to OPEN
    await page.getByRole("link", { name: /OPEN으로 승격|Promote|승격/i }).click();
    await page.locator("select, [name=ownerId]").first().selectOption({ index: 1 });
    await page.getByLabel(/가설|Hypothesis/i).fill("E2E test hypothesis");
    await page.getByLabel(/최소 행동|Minimal Action/i).fill("E2E test action");
    await page.getByLabel(/예상 근거|Expected Evidence/i).fill("E2E test evidence");
    await page.getByRole("button", { name: /승격|Promote|확인|Submit/i }).click();

    await expect(page.getByText("OPEN")).toBeVisible();

    // 4. Add Evidence
    await page.getByRole("link", { name: /증거 추가|Add Evidence/i }).click();
    await page.locator("select, [name=type]").first().selectOption("DATA");
    await page.locator("select, [name=strength]").first().selectOption("A");
    await page.getByLabel(/내용|Content/i).fill("Strong quantitative data");
    await page.getByRole("button", { name: /추가|Add|Submit/i }).click();

    // 5. Decide NEXT
    await page.getByRole("link", { name: /NEXT 결정|Decide NEXT/i }).click();
    await page.getByLabel(/결정 근거|Rationale/i).fill("Strong evidence supports moving forward");
    await page.getByRole("button", { name: /결정|Decide|확인|Submit/i }).click();

    await expect(page.getByText("NEXT")).toBeVisible();
  });
});
