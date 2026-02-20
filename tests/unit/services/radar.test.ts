/**
 * RadarService 단위 테스트
 *
 * 대상: app/lib/services/radar.service.ts
 * - getSources, createSource, updateSource, deleteSource, getItems, updateItemStatus
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createTestDb } from "tests/helpers/db";
import type { DB } from "~/db";
import { RadarService } from "~/lib/services/radar.service";
import { users, tenants, tenantMembers, radarSources, radarItems } from "~/db/schema";
import { eq } from "drizzle-orm";

let db: ReturnType<typeof createTestDb>;
let service: RadarService;

const USER_ID = "user-radar-1";
const OTHER_USER_ID = "user-radar-2";
const TENANT_ID = "tenant-radar-test";
const SOURCE_ID = "src-1";
const SOURCE_ID_2 = "src-2";
const ITEM_ID_1 = "item-1";
const ITEM_ID_2 = "item-2";

beforeAll(() => {
  db = createTestDb();
  service = new RadarService(db as unknown as DB);

  // 공통 fixture
  db.insert(users)
    .values([
      { id: USER_ID, email: "radar@test.com", name: "Radar User", role: "admin" },
      { id: OTHER_USER_ID, email: "radar2@test.com", name: "Radar User 2", role: "user" },
    ])
    .run();

  db.insert(tenants)
    .values({ id: TENANT_ID, name: "Radar Tenant", slug: "radar-tenant", ownerUserId: USER_ID })
    .run();

  db.insert(tenantMembers)
    .values({ id: "tm-radar-1", tenantId: TENANT_ID, userId: USER_ID })
    .run();

  // 소스 2개 (userId가 다름)
  db.insert(radarSources)
    .values([
      { id: SOURCE_ID, name: "RSS 소스", sourceType: "rss", url: "https://example.com/rss", userId: USER_ID },
      { id: SOURCE_ID_2, name: "공용 소스", sourceType: "web", url: "https://example.com/web", userId: null },
    ])
    .run();

  // 아이템 2개
  db.insert(radarItems)
    .values([
      { id: ITEM_ID_1, sourceId: SOURCE_ID, urlHash: "hash1", url: "https://a.com", title: "기사 1", status: "collected" },
      { id: ITEM_ID_2, sourceId: SOURCE_ID, urlHash: "hash2", url: "https://b.com", title: "기사 2", status: "reviewed" },
    ])
    .run();
});

// ============================================================================
// getSources
// ============================================================================

describe("RadarService", () => {
  describe("getSources", () => {
    it("전체 소스 조회 (옵션 없음)", async () => {
      const sources = await service.getSources();
      expect(sources.length).toBeGreaterThanOrEqual(2);
    });

    it("userOnly=true → 특정 사용자 소스 + null userId 소스", async () => {
      const sources = await service.getSources({ userOnly: true, userId: USER_ID });

      // USER_ID 소스 (src-1) + null 소스 (src-2)
      expect(sources.length).toBe(2);
      expect(sources.some((s) => s.id === SOURCE_ID)).toBe(true);
      expect(sources.some((s) => s.id === SOURCE_ID_2)).toBe(true);
    });
  });

  // ============================================================================
  // createSource
  // ============================================================================

  describe("createSource", () => {
    it("유효한 sourceType(rss)으로 생성", async () => {
      const id = await service.createSource({
        name: "새 RSS",
        sourceType: "rss",
        url: "https://new.com/rss",
        userId: USER_ID,
      });

      expect(id).toBeTruthy();

      const created = db.select().from(radarSources).where(eq(radarSources.id, id)).get();
      expect(created).toBeDefined();
      expect(created!.name).toBe("새 RSS");
      expect(created!.sourceType).toBe("rss");
    });

    it("유효한 sourceType(youtube)으로 생성", async () => {
      const id = await service.createSource({
        name: "YouTube 채널",
        sourceType: "youtube",
        url: "https://youtube.com/channel/xxx",
        userId: USER_ID,
      });

      expect(id).toBeTruthy();
    });

    it("무효한 sourceType → 에러 throw", async () => {
      await expect(
        service.createSource({
          name: "잘못된",
          sourceType: "twitter",
          url: "https://twitter.com",
          userId: USER_ID,
        }),
      ).rejects.toThrow("sourceType은 rss, web, youtube 중 하나여야 합니다");
    });
  });

  // ============================================================================
  // updateSource
  // ============================================================================

  describe("updateSource", () => {
    it("name, url 필드 업데이트", async () => {
      await service.updateSource(SOURCE_ID, { name: "수정된 RSS", url: "https://updated.com/rss" });

      const updated = db.select().from(radarSources).where(eq(radarSources.id, SOURCE_ID)).get();
      expect(updated!.name).toBe("수정된 RSS");
      expect(updated!.url).toBe("https://updated.com/rss");
    });

    it("enabled 비활성화", async () => {
      await service.updateSource(SOURCE_ID, { enabled: 0 });

      const updated = db.select().from(radarSources).where(eq(radarSources.id, SOURCE_ID)).get();
      expect(updated!.enabled).toBe(0);
    });
  });

  // ============================================================================
  // deleteSource
  // ============================================================================

  describe("deleteSource", () => {
    const DEL_SOURCE = "src-del-1";

    beforeAll(() => {
      db.insert(radarSources)
        .values({ id: DEL_SOURCE, name: "삭제대상", sourceType: "web", url: "https://del.com", userId: USER_ID })
        .run();
    });

    it("소스 삭제", async () => {
      await service.deleteSource(DEL_SOURCE);

      const found = db.select().from(radarSources).where(eq(radarSources.id, DEL_SOURCE)).get();
      expect(found).toBeUndefined();
    });
  });

  // ============================================================================
  // getItems
  // ============================================================================

  describe("getItems", () => {
    it("sourceId 필터", async () => {
      const items = await service.getItems({ sourceId: SOURCE_ID });

      expect(items.length).toBe(2);
      expect(items.every((i) => i.sourceId === SOURCE_ID)).toBe(true);
    });

    it("status 필터", async () => {
      const items = await service.getItems({ status: "reviewed" });

      expect(items.length).toBeGreaterThanOrEqual(1);
      expect(items.every((i) => i.status === "reviewed")).toBe(true);
    });

    it("limit 필터", async () => {
      const items = await service.getItems({ limit: 1 });

      expect(items.length).toBe(1);
    });

    it("필터 없음 → 전체 반환", async () => {
      const items = await service.getItems({});

      expect(items.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ============================================================================
  // updateItemStatus
  // ============================================================================

  describe("updateItemStatus", () => {
    it("아이템 상태 변경", async () => {
      await service.updateItemStatus(ITEM_ID_1, "promoted");

      const item = db.select().from(radarItems).where(eq(radarItems.id, ITEM_ID_1)).get();
      expect(item!.status).toBe("promoted");
    });
  });
});
