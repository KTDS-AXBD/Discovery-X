import { test, expect } from "@playwright/test";

/**
 * 스모크 테스트 — 인증 없이 실행 가능한 최소 검증.
 * public 프로젝트에서 실행된다.
 */
test.describe("Smoke Tests (인증 불필요)", () => {
  test("GET /login — 로그인 페이지 로드 + Google 로그인 버튼 존재", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    expect(page.url()).toContain("/login");

    // Google 로그인 버튼 존재 확인
    const googleBtn = page.getByRole("button", {
      name: /Google|구글|로그인/i,
    });
    await expect(googleBtn.first()).toBeVisible();
  });

  test("GET /api/health — 200 응답 + JSON 구조 검증", async ({ request }) => {
    const response = await request.get("/api/health");

    // 상태 코드: 200(healthy) 또는 503(degraded)
    expect([200, 503]).toContain(response.status());

    const body = await response.json();
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("timestamp");
    expect(body).toHaveProperty("version");
    expect(body).toHaveProperty("checks");
  });

  test("GET /pending — 승인 대기 페이지 로드", async ({ page }) => {
    await page.goto("/pending");
    await page.waitForLoadState("networkidle");

    // /pending 페이지가 로드되거나 리다이렉트
    const url = page.url();
    expect(url).toMatch(/\/(pending|login)/);
  });

  test("알 수 없는 경로 — 적절한 에러 처리", async ({ page }) => {
    const response = await page.goto("/this-route-does-not-exist-12345");
    await page.waitForLoadState("networkidle");

    // 404 응답 또는 리다이렉트 (로그인 또는 에러 페이지)
    const url = page.url();
    const status = response?.status();
    // 404를 반환하거나, 로그인으로 리다이렉트하거나, 에러 페이지를 보여줌
    expect(status === 404 || url.includes("/login") || status === 200).toBe(
      true,
    );
  });
});
