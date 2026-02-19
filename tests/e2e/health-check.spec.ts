import { test, expect } from "@playwright/test";

test.describe("API Health Check", () => {
  test("GET /api/health — 200 응답 + JSON 검증", async ({ request }) => {
    const response = await request.get("/api/health");

    // 상태 코드: 200(healthy) 또는 503(degraded) — 둘 다 유효한 응답
    expect([200, 503]).toContain(response.status());

    const body = await response.json();

    // 필수 필드 존재 확인
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("timestamp");
    expect(body).toHaveProperty("version");
    expect(body).toHaveProperty("checks");

    // status 값 유효성
    expect(["healthy", "degraded", "unhealthy"]).toContain(body.status);

    // timestamp ISO 형식
    expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // checks 하위 구조
    expect(body.checks).toHaveProperty("database");
    expect(body.checks.database).toHaveProperty("status");
    expect(["ok", "error"]).toContain(body.checks.database.status);
    expect(body.checks.database).toHaveProperty("latencyMs");
  });

  test("GET /api/health — version 필드가 문자열", async ({ request }) => {
    const response = await request.get("/api/health");
    const body = await response.json();

    expect(typeof body.version).toBe("string");
    expect(body.version.length).toBeGreaterThan(0);
  });

  test("GET /api/health — vectorize 상태 포함", async ({ request }) => {
    const response = await request.get("/api/health");
    const body = await response.json();

    expect(body.checks).toHaveProperty("vectorize");
    expect(body.checks.vectorize).toHaveProperty("status");
    expect(["ok", "unavailable"]).toContain(body.checks.vectorize.status);
  });

  test("GET /api/health — featureFlags 객체 포함", async ({ request }) => {
    const response = await request.get("/api/health");
    const body = await response.json();

    expect(body.checks).toHaveProperty("featureFlags");
    expect(typeof body.checks.featureFlags).toBe("object");
  });
});
