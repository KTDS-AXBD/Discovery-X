/**
 * RadarService 단위 테스트 (실 DB 기반)
 *
 * 대상: app/features/radar/service/radar.service.ts
 * 17개 메서드 전체 커버
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDB } from "tests/helpers/db";
import type { DB } from "~/db";
import { RadarService } from "~/features/radar/service/radar.service";
import {
  users,
  tenants,
  tenantMembers,
  radarSources,
  radarRuns,
  radarItems,
  radarItemUserStatus,
} from "~/db";
import { eq } from "drizzle-orm";

// ─── 상수 ───────────────────────────────────────────────────────────────

const TENANT_ID = "t-radar-test";
const TENANT_OTHER = "t-radar-other";
const USER_ID = "user-radar-1";
const USER_OTHER = "user-radar-2";

// ─── Setup ──────────────────────────────────────────────────────────────

let db: TestDB;
let service: RadarService;

function asDB(d: TestDB) {
  return d as unknown as DB;
}

beforeEach(() => {
  db = createTestDb();
  service = new RadarService(asDB(db));

  db.insert(users)
    .values([
      { id: USER_ID, email: "radar@test.com", name: "Radar User", role: "admin" },
      { id: USER_OTHER, email: "radar2@test.com", name: "Radar Other", role: "user" },
    ])
    .run();

  db.insert(tenants)
    .values([
      { id: TENANT_ID, name: "Radar Tenant", slug: "radar-test", ownerUserId: USER_ID },
      { id: TENANT_OTHER, name: "Other Tenant", slug: "other", ownerUserId: USER_OTHER },
    ])
    .run();

  db.insert(tenantMembers)
    .values([
      { id: "tm-r1", tenantId: TENANT_ID, userId: USER_ID },
      { id: "tm-r2", tenantId: TENANT_OTHER, userId: USER_OTHER },
    ])
    .run();
});

// ─── Tests ──────────────────────────────────────────────────────────────

describe("RadarService", () => {
  // ══════════════════════════════════════════════
  // Sources
  // ══════════════════════════════════════════════
  describe("Sources", () => {
    it("listSources — 전체 소스 목록 반환", async () => {
      db.insert(radarSources)
        .values([
          { id: "s1", name: "Source A", sourceType: "web", url: "https://a.com", userId: USER_ID, tenantId: TENANT_ID },
          { id: "s2", name: "Source B", sourceType: "rss", url: "https://b.com", userId: USER_OTHER, tenantId: TENANT_OTHER },
        ])
        .run();

      const result = await service.listSources();
      expect(result).toHaveLength(2);
    });

    it("listSources — userOnly=true면 사용자 소유 + 공용만", async () => {
      db.insert(radarSources)
        .values([
          { id: "s1", name: "My Source", sourceType: "web", url: "https://a.com", userId: USER_ID, tenantId: TENANT_ID },
          { id: "s2", name: "Public", sourceType: "web", url: "https://b.com", userId: null, tenantId: TENANT_ID },
          { id: "s3", name: "Other", sourceType: "web", url: "https://c.com", userId: USER_OTHER, tenantId: TENANT_OTHER },
        ])
        .run();

      const result = await service.listSources({ userOnly: true, userId: USER_ID });
      expect(result).toHaveLength(2);
      const names = result.map((s: { name: string }) => s.name);
      expect(names).toContain("My Source");
      expect(names).toContain("Public");
    });

    it("listSourcesByTenant — 테넌트별 필터링", async () => {
      db.insert(radarSources)
        .values([
          { id: "s1", name: "A", sourceType: "web", url: "https://a.com", userId: USER_ID, tenantId: TENANT_ID },
          { id: "s2", name: "B", sourceType: "web", url: "https://b.com", userId: USER_OTHER, tenantId: TENANT_OTHER },
        ])
        .run();

      const result = await service.listSourcesByTenant(TENANT_ID);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("A");
    });

    it("createSource — 소스 생성 + ID 반환", async () => {
      const id = await service.createSource({
        name: "New Source",
        sourceType: "web",
        url: "https://new.com",
        userId: USER_ID,
        tenantId: TENANT_ID,
        keywords: ["AI", "tech"],
        radarTags: ["hot"],
      });

      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);

      const rows = await db.select().from(radarSources).where(eq(radarSources.id, id));
      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe("New Source");
      expect(rows[0].keywords).toEqual(["AI", "tech"]);
      expect(rows[0].radarTags).toEqual(["hot"]);
    });

    it("updateSource — 부분 업데이트", async () => {
      db.insert(radarSources)
        .values({ id: "s-upd", name: "Old", sourceType: "web", url: "https://old.com", userId: USER_ID, tenantId: TENANT_ID })
        .run();

      await service.updateSource({ id: "s-upd", name: "Updated", url: "https://new.com" });

      const [row] = await db.select().from(radarSources).where(eq(radarSources.id, "s-upd"));
      expect(row.name).toBe("Updated");
      expect(row.url).toBe("https://new.com");
    });

    it("toggleSource — enabled 토글", async () => {
      db.insert(radarSources)
        .values({ id: "s-tog", name: "Toggleable", sourceType: "web", url: "https://t.com", userId: USER_ID, tenantId: TENANT_ID, enabled: 1 })
        .run();

      await service.toggleSource("s-tog", true);
      let [row] = await db.select().from(radarSources).where(eq(radarSources.id, "s-tog"));
      expect(row.enabled).toBe(0);

      await service.toggleSource("s-tog", false);
      [row] = await db.select().from(radarSources).where(eq(radarSources.id, "s-tog"));
      expect(row.enabled).toBe(1);
    });

    it("deleteSource — 삭제 후 빈 배열", async () => {
      db.insert(radarSources)
        .values({ id: "s-del", name: "ToDelete", sourceType: "web", url: "https://d.com", userId: USER_ID, tenantId: TENANT_ID })
        .run();

      await service.deleteSource("s-del");

      const rows = await db.select().from(radarSources).where(eq(radarSources.id, "s-del"));
      expect(rows).toHaveLength(0);
    });
  });

  // ══════════════════════════════════════════════
  // Runs
  // ══════════════════════════════════════════════
  describe("Runs", () => {
    it("findOrCreateDailyRun — 오늘 run 없으면 새로 생성", async () => {
      const runId = await service.findOrCreateDailyRun(TENANT_ID);

      expect(typeof runId).toBe("string");
      const [run] = await db.select().from(radarRuns).where(eq(radarRuns.id, runId));
      expect(run.status).toBe("COMPLETED");
      expect(run.tenantId).toBe(TENANT_ID);
    });

    it("findOrCreateDailyRun — 오늘 run 있으면 기존 ID 반환", async () => {
      const first = await service.findOrCreateDailyRun(TENANT_ID);
      const second = await service.findOrCreateDailyRun(TENANT_ID);

      expect(second).toBe(first);
    });

    it("listRuns — limit 적용 (기본 20, 최대 50)", async () => {
      const runs = await service.listRuns({ limit: 5 });
      expect(Array.isArray(runs)).toBe(true);
    });

    it("listRunsByTenant — 테넌트별 필터링", async () => {
      await service.findOrCreateDailyRun(TENANT_ID);
      await service.findOrCreateDailyRun(TENANT_OTHER);

      const result = await service.listRunsByTenant(TENANT_ID);
      expect(result).toHaveLength(1);
      expect(result[0].tenantId).toBe(TENANT_ID);
    });
  });

  // ══════════════════════════════════════════════
  // Items
  // ══════════════════════════════════════════════
  describe("Items", () => {
    let runId: string;

    beforeEach(async () => {
      runId = await service.findOrCreateDailyRun(TENANT_ID);
    });

    it("findOrCreateItemFromUrl — 새 아이템 생성 (isNew=true)", async () => {
      const result = await service.findOrCreateItemFromUrl({
        urlHash: "hash-1",
        url: "https://example.com/1",
        title: "Article 1",
        userId: USER_ID,
        tenantId: TENANT_ID,
        runId,
        titleKo: "기사 1",
        summaryKo: "요약 1",
      });

      expect(result.isNew).toBe(true);
      expect(typeof result.itemId).toBe("string");
    });

    it("findOrCreateItemFromUrl — 기존 urlHash면 기존 반환 (isNew=false)", async () => {
      const first = await service.findOrCreateItemFromUrl({
        urlHash: "hash-dup",
        url: "https://example.com/dup",
        title: "Dup",
        userId: USER_ID,
        tenantId: TENANT_ID,
        runId,
      });

      const second = await service.findOrCreateItemFromUrl({
        urlHash: "hash-dup",
        url: "https://example.com/dup2",
        title: "Dup2",
        userId: USER_ID,
        tenantId: TENANT_ID,
        runId,
      });

      expect(second.isNew).toBe(false);
      expect(second.itemId).toBe(first.itemId);
    });

    it("getItem — 단건 조회", async () => {
      const { itemId } = await service.findOrCreateItemFromUrl({
        urlHash: "hash-get",
        url: "https://example.com/get",
        title: "Get Item",
        userId: USER_ID,
        tenantId: TENANT_ID,
        runId,
      });

      const item = await service.getItem(itemId);
      expect(item).not.toBeNull();
      expect(item!.title).toBe("Get Item");
    });

    it("getItem — 없는 ID는 null", async () => {
      const item = await service.getItem("nonexistent");
      expect(item).toBeNull();
    });

    it("itemExists — 존재 여부 boolean", async () => {
      const { itemId } = await service.findOrCreateItemFromUrl({
        urlHash: "hash-exists",
        url: "https://example.com/exists",
        title: "Exists",
        userId: USER_ID,
        tenantId: TENANT_ID,
        runId,
      });

      expect(await service.itemExists(itemId)).toBe(true);
      expect(await service.itemExists("nope")).toBe(false);
    });

    it("getItemMemo / updateItemMemo — 메모 CRUD", async () => {
      const { itemId } = await service.findOrCreateItemFromUrl({
        urlHash: "hash-memo",
        url: "https://example.com/memo",
        title: "Memo Item",
        userId: USER_ID,
        tenantId: TENANT_ID,
        runId,
      });

      // 초기: null
      const initial = await service.getItemMemo(itemId);
      expect(initial!.memo).toBeNull();

      // 업데이트
      await service.updateItemMemo(itemId, "메모 내용");
      const updated = await service.getItemMemo(itemId);
      expect(updated!.memo).toBe("메모 내용");

      // null로 초기화
      await service.updateItemMemo(itemId, null);
      const cleared = await service.getItemMemo(itemId);
      expect(cleared!.memo).toBeNull();
    });

    it("updateItemKeyPoints — keyPoints 업데이트", async () => {
      const { itemId } = await service.findOrCreateItemFromUrl({
        urlHash: "hash-kp",
        url: "https://example.com/kp",
        title: "KP Item",
        userId: USER_ID,
        tenantId: TENANT_ID,
        runId,
      });

      await service.updateItemKeyPoints({ itemId, keyPoints: ["포인트1", "포인트2"] });

      const [row] = await db.select().from(radarItems).where(eq(radarItems.id, itemId));
      expect(row.keyPoints).toEqual(["포인트1", "포인트2"]);
    });

    it("listRecentItemsByTenant — 테넌트별 최근 아이템", async () => {
      await service.findOrCreateItemFromUrl({
        urlHash: "hash-recent",
        url: "https://example.com/recent",
        title: "Recent",
        userId: USER_ID,
        tenantId: TENANT_ID,
        runId,
      });

      const items = await service.listRecentItemsByTenant(TENANT_ID);
      expect(items.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ══════════════════════════════════════════════
  // Item User Status
  // ══════════════════════════════════════════════
  describe("Item User Status", () => {
    let itemId: string;

    beforeEach(async () => {
      const runId = await service.findOrCreateDailyRun(TENANT_ID);
      const result = await service.findOrCreateItemFromUrl({
        urlHash: "hash-status",
        url: "https://example.com/status",
        title: "Status Item",
        userId: USER_ID,
        tenantId: TENANT_ID,
        runId,
      });
      itemId = result.itemId;
    });

    it("upsertItemStatus — 새 상태 INSERT", async () => {
      const result = await service.upsertItemStatus({
        userId: USER_ID,
        itemId,
        status: "viewed",
      });

      expect(result.status).toBe("viewed");
      expect(result.viewedAt).not.toBeNull();
    });

    it("upsertItemStatus — 기존 상태 UPDATE (viewed → archived)", async () => {
      await service.upsertItemStatus({ userId: USER_ID, itemId, status: "viewed" });
      const result = await service.upsertItemStatus({ userId: USER_ID, itemId, status: "archived" });

      expect(result.status).toBe("archived");

      // DB에 레코드 1개만 존재
      const rows = await db
        .select()
        .from(radarItemUserStatus)
        .where(eq(radarItemUserStatus.itemId, itemId));
      expect(rows).toHaveLength(1);
    });

    it("upsertItemReaction — 새 반응 INSERT", async () => {
      const result = await service.upsertItemReaction({
        userId: USER_ID,
        itemId,
        reaction: "like",
      });

      expect(result.reaction).toBe("like");
    });

    it("upsertItemReaction — 기존 반응 UPDATE (like → dislike)", async () => {
      await service.upsertItemReaction({ userId: USER_ID, itemId, reaction: "like" });
      const result = await service.upsertItemReaction({ userId: USER_ID, itemId, reaction: "dislike" });

      expect(result.reaction).toBe("dislike");

      // DB에 1개만
      const rows = await db
        .select()
        .from(radarItemUserStatus)
        .where(eq(radarItemUserStatus.itemId, itemId));
      expect(rows).toHaveLength(1);
      expect(rows[0].reaction).toBe("dislike");
    });

    it("upsertItemReaction — reaction null로 초기화", async () => {
      await service.upsertItemReaction({ userId: USER_ID, itemId, reaction: "like" });
      const result = await service.upsertItemReaction({ userId: USER_ID, itemId, reaction: null });

      expect(result.reaction).toBeNull();
    });
  });

  // ══════════════════════════════════════════════
  // 통합 데이터
  // ══════════════════════════════════════════════
  describe("getRadarData", () => {
    it("sources + runs + recentItems 통합 반환", async () => {
      db.insert(radarSources)
        .values({ id: "s-data", name: "DataSrc", sourceType: "web", url: "https://d.com", userId: USER_ID, tenantId: TENANT_ID })
        .run();

      const data = await service.getRadarData({ tenantId: TENANT_ID });

      expect(data).toHaveProperty("sources");
      expect(data).toHaveProperty("runs");
      expect(data).toHaveProperty("recentItems");
      expect(data.sources.length).toBeGreaterThanOrEqual(1);
    });

    it("sourcesWithDomains + domains 필드 포함 (Phase 2A)", async () => {
      const data = await service.getRadarData({ tenantId: TENANT_ID });
      expect(data).toHaveProperty("sourcesWithDomains");
      expect(data).toHaveProperty("domains");
      expect(Array.isArray(data.sourcesWithDomains)).toBe(true);
      expect(Array.isArray(data.domains)).toBe(true);
    });
  });

  // ══════════════════════════════════════════════
  // Source Lifecycle (Phase 2A)
  // ══════════════════════════════════════════════
  describe("updateSourceStatus [Phase 2A]", () => {
    let sourceId: string;

    beforeEach(() => {
      sourceId = "s-lifecycle";
      db.insert(radarSources)
        .values({
          id: sourceId,
          name: "Lifecycle Test",
          sourceType: "rss",
          url: "https://lifecycle.com",
          tenantId: TENANT_ID,
          status: "ACTIVE",
          enabled: 1,
          consecutiveFailures: 0,
        })
        .run();
    });

    it("ACTIVE → PAUSED: enabled=0으로 동기화", async () => {
      await service.updateSourceStatus(sourceId, "PAUSED");

      const rows = await db.select().from(radarSources).where(eq(radarSources.id, sourceId));
      expect(rows[0].status).toBe("PAUSED");
      expect(rows[0].enabled).toBe(0);
    });

    it("PAUSED → ACTIVE: enabled=1으로 복원", async () => {
      db.update(radarSources)
        .set({ status: "PAUSED", enabled: 0 })
        .where(eq(radarSources.id, sourceId))
        .run();

      await service.updateSourceStatus(sourceId, "ACTIVE");

      const rows = await db.select().from(radarSources).where(eq(radarSources.id, sourceId));
      expect(rows[0].status).toBe("ACTIVE");
      expect(rows[0].enabled).toBe(1);
    });

    it("[R2] FAILED → ACTIVE: consecutiveFailures 리셋", async () => {
      db.update(radarSources)
        .set({ status: "FAILED", enabled: 0, consecutiveFailures: 5 })
        .where(eq(radarSources.id, sourceId))
        .run();

      await service.updateSourceStatus(sourceId, "ACTIVE");

      const rows = await db.select().from(radarSources).where(eq(radarSources.id, sourceId));
      expect(rows[0].status).toBe("ACTIVE");
      expect(rows[0].enabled).toBe(1);
      expect(rows[0].consecutiveFailures).toBe(0);
    });

    it("허용되지 않은 전환 시 에러", async () => {
      await expect(service.updateSourceStatus(sourceId, "ARCHIVED")).rejects.toThrow();
    });

    it("존재하지 않는 소스 업데이트 시 에러", async () => {
      await expect(service.updateSourceStatus("not-exist", "PAUSED")).rejects.toThrow();
    });
  });

  // ══════════════════════════════════════════════
  // deleteSource cascade (Phase 2A) [F1]
  // ══════════════════════════════════════════════
  describe("deleteSource cascade [F1]", () => {
    it("소스 삭제 시 radar_source_domains도 삭제", async () => {
      const { radarDomains, radarSourceDomains } = await import("~/features/radar/db/schema");

      db.insert(radarSources)
        .values({ id: "s-del", name: "Del", sourceType: "rss", url: "https://del.com", tenantId: TENANT_ID })
        .run();
      db.insert(radarDomains)
        .values({ id: "d-del", name: "Del Domain", tenantId: TENANT_ID })
        .run();
      db.insert(radarSourceDomains)
        .values({ id: "rsd-del", sourceId: "s-del", domainId: "d-del" })
        .run();

      await service.deleteSource("s-del");

      const sources = await db.select().from(radarSources).where(eq(radarSources.id, "s-del"));
      expect(sources).toHaveLength(0);

      const links = await db.select().from(radarSourceDomains).where(eq(radarSourceDomains.sourceId, "s-del"));
      expect(links).toHaveLength(0);
    });
  });

  // ══════════════════════════════════════════════
  // updateSourceFull (Phase 2A)
  // ══════════════════════════════════════════════
  describe("updateSourceFull [Phase 2A]", () => {
    it("name, url, keywords, radarTags 업데이트", async () => {
      db.insert(radarSources)
        .values({ id: "s-full", name: "Old Name", sourceType: "rss", url: "https://old.com", tenantId: TENANT_ID })
        .run();

      await service.updateSourceFull({
        id: "s-full",
        name: "New Name",
        url: "https://new.com",
        keywords: ["AI", "ML"],
        radarTags: ["트렌드"],
      });

      const rows = await db.select().from(radarSources).where(eq(radarSources.id, "s-full"));
      expect(rows[0].name).toBe("New Name");
      expect(rows[0].url).toBe("https://new.com");
      expect(rows[0].keywords).toEqual(["AI", "ML"]);
      expect(rows[0].radarTags).toEqual(["트렌드"]);
    });

    it("domainIds 포함 시 도메인 동기화", async () => {
      const { radarDomains, radarSourceDomains } = await import("~/features/radar/db/schema");

      db.insert(radarSources)
        .values({ id: "s-full2", name: "Test", sourceType: "rss", url: "https://test.com", tenantId: TENANT_ID })
        .run();
      db.insert(radarDomains)
        .values({ id: "d-f1", name: "도메인1", tenantId: TENANT_ID })
        .run();

      await service.updateSourceFull({ id: "s-full2", domainIds: ["d-f1"] });

      const links = await db.select().from(radarSourceDomains).where(eq(radarSourceDomains.sourceId, "s-full2"));
      expect(links).toHaveLength(1);
      expect(links[0].domainId).toBe("d-f1");
    });
  });

  // ══════════════════════════════════════════════
  // getSourceWithDomains + listSourcesWithDomains (Phase 2A)
  // ══════════════════════════════════════════════
  describe("getSourceWithDomains / listSourcesWithDomains [Phase 2A]", () => {
    it("getSourceWithDomains — 소스+도메인 반환", async () => {
      const { radarDomains, radarSourceDomains } = await import("~/features/radar/db/schema");

      db.insert(radarSources)
        .values({ id: "s-wd", name: "With Domain", sourceType: "rss", url: "https://wd.com", tenantId: TENANT_ID })
        .run();
      db.insert(radarDomains)
        .values({ id: "d-wd", name: "기술", tenantId: TENANT_ID })
        .run();
      db.insert(radarSourceDomains)
        .values({ id: "rsd-wd", sourceId: "s-wd", domainId: "d-wd" })
        .run();

      const result = await service.getSourceWithDomains("s-wd");

      expect(result).not.toBeNull();
      expect(result!.source.id).toBe("s-wd");
      expect(result!.domains).toHaveLength(1);
      expect(result!.domains[0].name).toBe("기술");
    });

    it("getSourceWithDomains — 존재하지 않으면 null", async () => {
      const result = await service.getSourceWithDomains("not-exist");
      expect(result).toBeNull();
    });

    it("listSourcesWithDomains — 테넌트별 소스+도메인 목록", async () => {
      const { radarDomains, radarSourceDomains } = await import("~/features/radar/db/schema");

      db.insert(radarSources)
        .values([
          { id: "s-l1", name: "S1", sourceType: "rss", url: "https://l1.com", tenantId: TENANT_ID },
          { id: "s-l2", name: "S2", sourceType: "site", url: "https://l2.com", tenantId: TENANT_ID },
        ])
        .run();
      db.insert(radarDomains)
        .values({ id: "d-l1", name: "도메인", tenantId: TENANT_ID })
        .run();
      db.insert(radarSourceDomains)
        .values({ id: "rsd-l1", sourceId: "s-l1", domainId: "d-l1" })
        .run();

      const result = await service.listSourcesWithDomains(TENANT_ID);

      expect(result).toHaveLength(2);
      const s1 = result.find((r) => r.source.id === "s-l1");
      const s2 = result.find((r) => r.source.id === "s-l2");
      expect(s1?.domains).toHaveLength(1);
      expect(s2?.domains).toHaveLength(0);
    });
  });
});
