import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDB } from "../../../helpers/db";
import type { DB } from "~/db";
import { tenants, users } from "~/db";
import {
  PalSettingsService,
  DEFAULT_PAL_SETTINGS,
} from "~/features/cost/service/pal-settings.service";

// ============================================================================
// HELPERS
// ============================================================================

const TENANT_ID = "t-pal-test";
const OWNER_ID = "u-pal-owner";

async function seedTenant(db: TestDB) {
  await db.insert(users).values({
    id: OWNER_ID,
    email: "pal-owner@test.com",
    name: "PAL Owner",
  });
  await db.insert(tenants).values({
    id: TENANT_ID,
    name: "PAL Test Org",
    slug: "pal-test",
    ownerUserId: OWNER_ID,
    settings: {},
  });
}

// ============================================================================
// TESTS
// ============================================================================

describe("PalSettingsService", () => {
  let db: TestDB;
  let service: PalSettingsService;

  beforeEach(async () => {
    db = createTestDb();
    service = new PalSettingsService(db as unknown as DB);
    await seedTenant(db);
  });

  // ---------- getSettings ----------

  it("미설정 테넌트는 기본값 반환", async () => {
    const result = await service.getSettings(TENANT_ID);
    expect(result).toEqual(DEFAULT_PAL_SETTINGS);
  });

  it("존재하지 않는 테넌트는 기본값 반환", async () => {
    const result = await service.getSettings("non-existent");
    expect(result).toEqual(DEFAULT_PAL_SETTINGS);
  });

  // ---------- updateSettings ----------

  it("enabled 토글 업데이트", async () => {
    const result = await service.updateSettings(TENANT_ID, { enabled: true });
    expect(result.enabled).toBe(true);
    expect(result.frugalThreshold).toBe(0.3); // 나머지 기본값 유지
  });

  it("임계값 커스터마이즈", async () => {
    const result = await service.updateSettings(TENANT_ID, {
      frugalThreshold: 0.2,
      standardThreshold: 0.6,
    });
    expect(result.frugalThreshold).toBe(0.2);
    expect(result.standardThreshold).toBe(0.6);
  });

  it("가중치 부분 업데이트 — 나머지 기본값 유지", async () => {
    const result = await service.updateSettings(TENANT_ID, {
      weights: { token: 0.5, tool: 0.2, depth: 0.3 },
    });
    expect(result.weights).toEqual({ token: 0.5, tool: 0.2, depth: 0.3 });
  });

  it("여러 번 부분 업데이트 — 이전 값 보존", async () => {
    await service.updateSettings(TENANT_ID, { enabled: true });
    await service.updateSettings(TENANT_ID, { frugalThreshold: 0.25 });

    const result = await service.getSettings(TENANT_ID);
    expect(result.enabled).toBe(true);
    expect(result.frugalThreshold).toBe(0.25);
  });

  it("기존 tenants.settings의 다른 필드 보존", async () => {
    await db
      .update(tenants)
      .set({
        settings: {
          branding: { displayName: "My Org" },
          features: { radarEnabled: true },
        },
      })
      .where(eq(tenants.id, TENANT_ID));

    await service.updateSettings(TENANT_ID, { enabled: true });

    const [row] = await db
      .select({ settings: tenants.settings })
      .from(tenants)
      .where(eq(tenants.id, TENANT_ID))
      .limit(1);

    expect(row.settings?.branding?.displayName).toBe("My Org");
    expect(row.settings?.features?.radarEnabled).toBe(true);
    expect(row.settings?.pal?.enabled).toBe(true);
  });

  // ---------- validation ----------

  it("frugalThreshold 범위 초과 시 에러", async () => {
    await expect(
      service.updateSettings(TENANT_ID, { frugalThreshold: 1.5 }),
    ).rejects.toThrow("frugalThreshold must be between 0 and 1");
  });

  it("standardThreshold 범위 초과 시 에러", async () => {
    await expect(
      service.updateSettings(TENANT_ID, { standardThreshold: -0.1 }),
    ).rejects.toThrow("standardThreshold must be between 0 and 1");
  });

  it("frugal >= standard 시 에러", async () => {
    await expect(
      service.updateSettings(TENANT_ID, {
        frugalThreshold: 0.8,
        standardThreshold: 0.5,
      }),
    ).rejects.toThrow("frugalThreshold (0.8) must be less than standardThreshold (0.5)");
  });

  it("가중치 합이 1.0이 아니면 에러", async () => {
    await expect(
      service.updateSettings(TENANT_ID, {
        weights: { token: 0.5, tool: 0.5, depth: 0.5 },
      }),
    ).rejects.toThrow("Weights must sum to 1.0");
  });

  it("존재하지 않는 테넌트에 업데이트 시 에러", async () => {
    await expect(
      service.updateSettings("non-existent", { enabled: true }),
    ).rejects.toThrow("Tenant not found: non-existent");
  });

  // ---------- resetSettings ----------

  it("설정 리셋 → 기본값 복원", async () => {
    await service.updateSettings(TENANT_ID, {
      enabled: true,
      frugalThreshold: 0.2,
    });
    const result = await service.resetSettings(TENANT_ID);
    expect(result).toEqual(DEFAULT_PAL_SETTINGS);

    // DB에서도 확인
    const after = await service.getSettings(TENANT_ID);
    expect(after).toEqual(DEFAULT_PAL_SETTINGS);
  });

  it("리셋 시 다른 settings 필드 보존", async () => {
    await db
      .update(tenants)
      .set({
        settings: {
          branding: { displayName: "Keep Me" },
          pal: { enabled: true, frugalThreshold: 0.1, standardThreshold: 0.5 },
        },
      })
      .where(eq(tenants.id, TENANT_ID));

    await service.resetSettings(TENANT_ID);

    const [row] = await db
      .select({ settings: tenants.settings })
      .from(tenants)
      .where(eq(tenants.id, TENANT_ID))
      .limit(1);

    expect(row.settings?.branding?.displayName).toBe("Keep Me");
    expect(row.settings?.pal).toBeUndefined();
  });
});
