/**
 * IdeaService 단위 테스트
 * 대상: app/lib/services/idea.service.ts
 *
 * - list/getById/create/updateTitle/delete/getSources/addSource/removeSource
 * - ideas, ideaSources, radarItems 테이블 연동
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createTestDb } from "tests/helpers/db";
import type { DB } from "~/db";
import { IdeaService } from "~/lib/services/idea.service";
import { users, tenants, tenantMembers, radarSources, radarItems } from "~/db/schema";
import { ideas, ideaSources } from "~/features/ideas/db/schema";
import { eq } from "drizzle-orm";

let db: ReturnType<typeof createTestDb>;
let service: IdeaService;

const TENANT_ID = "t-idea-test";
const TENANT_OTHER = "t-idea-other";
const USER_ID = "user-idea-1";
const IDEA_1 = "idea-test-1";
const IDEA_2 = "idea-test-2";
const RADAR_SOURCE_ID = "rs-idea-test";
const RADAR_ITEM_1 = "ri-idea-1";
const RADAR_ITEM_2 = "ri-idea-2";

beforeAll(() => {
  db = createTestDb();
  service = new IdeaService(db as unknown as DB);

  // ── 기본 데이터 ──

  db.insert(users)
    .values({ id: USER_ID, email: "idea@test.com", name: "Idea User", role: "user" })
    .run();

  db.insert(tenants)
    .values([
      { id: TENANT_ID, name: "Idea Tenant", slug: "idea-test", ownerUserId: USER_ID },
      { id: TENANT_OTHER, name: "Other Tenant", slug: "idea-other", ownerUserId: USER_ID },
    ])
    .run();

  db.insert(tenantMembers)
    .values({ id: "tm-idea-1", tenantId: TENANT_ID, userId: USER_ID })
    .run();

  // Ideas
  const now = new Date();
  db.insert(ideas)
    .values([
      {
        id: IDEA_1,
        tenantId: TENANT_ID,
        ownerId: USER_ID,
        title: "첫 번째 아이디어",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: IDEA_2,
        tenantId: TENANT_ID,
        ownerId: USER_ID,
        title: "두 번째 아이디어",
        createdAt: new Date(now.getTime() - 1000), // 1초 전
        updatedAt: now,
      },
      {
        // 다른 테넌트
        id: "idea-other",
        tenantId: TENANT_OTHER,
        ownerId: USER_ID,
        title: "다른 테넌트 아이디어",
        createdAt: now,
        updatedAt: now,
      },
    ])
    .run();

  // RadarSources (radarItems FK 충족)
  db.insert(radarSources)
    .values({
      id: RADAR_SOURCE_ID,
      name: "Test Source",
      sourceType: "rss",
      url: "https://example.com/rss",
      tenantId: TENANT_ID,
    })
    .run();

  // RadarItems
  db.insert(radarItems)
    .values([
      {
        id: RADAR_ITEM_1,
        sourceId: RADAR_SOURCE_ID,
        urlHash: "hash-1",
        url: "https://example.com/1",
        title: "Radar Article 1",
        titleKo: "레이더 기사 1",
        summaryKo: "요약 1",
        status: "collected",
      },
      {
        id: RADAR_ITEM_2,
        sourceId: RADAR_SOURCE_ID,
        urlHash: "hash-2",
        url: "https://example.com/2",
        title: "Radar Article 2",
        titleKo: "레이더 기사 2",
        summaryKo: "요약 2",
        status: "collected",
      },
    ])
    .run();

  // IdeaSources (기존 연결)
  db.insert(ideaSources)
    .values({
      id: "is-1",
      ideaId: IDEA_1,
      radarItemId: RADAR_ITEM_1,
    })
    .run();
});

// ============================================================================
// 1. list
// ============================================================================

describe("IdeaService", () => {
  describe("list", () => {
    it("tenant별 아이디어 목록 조회", async () => {
      const items = await service.list(TENANT_ID);

      expect(items.length).toBe(2);
      // 다른 테넌트 제외
      expect(items.every((i) => i.id !== "idea-other")).toBe(true);
    });

    it("다른 테넌트 조회 시 해당 테넌트 데이터만", async () => {
      const items = await service.list(TENANT_OTHER);
      expect(items).toHaveLength(1);
      expect(items[0].id).toBe("idea-other");
    });

    it("반환 필드에 id, title, status, createdAt 포함", async () => {
      const items = await service.list(TENANT_ID);
      const first = items[0];

      expect(first).toHaveProperty("id");
      expect(first).toHaveProperty("title");
      expect(first).toHaveProperty("status");
      expect(first).toHaveProperty("createdAt");
    });
  });

  // ============================================================================
  // 2. getById
  // ============================================================================

  describe("getById", () => {
    it("존재하는 ID — Idea 반환", async () => {
      const idea = await service.getById(IDEA_1);
      expect(idea).not.toBeNull();
      expect(idea!.title).toBe("첫 번째 아이디어");
      expect(idea!.tenantId).toBe(TENANT_ID);
    });

    it("존재하지 않는 ID — null 반환", async () => {
      const idea = await service.getById("non-existent");
      expect(idea).toBeNull();
    });
  });

  // ============================================================================
  // 3. create
  // ============================================================================

  describe("create", () => {
    it("아이디어 생성 후 ID 반환", async () => {
      const id = await service.create({
        title: "새 아이디어",
        ownerId: USER_ID,
        tenantId: TENANT_ID,
      });

      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);

      // DB에서 조회 확인
      const idea = await service.getById(id);
      expect(idea).not.toBeNull();
      expect(idea!.title).toBe("새 아이디어");
      expect(idea!.ownerId).toBe(USER_ID);
      expect(idea!.status).toBe("ACTIVE");
    });
  });

  // ============================================================================
  // 4. updateTitle
  // ============================================================================

  describe("updateTitle", () => {
    it("제목 수정 성공", async () => {
      await service.updateTitle(IDEA_2, "수정된 제목");

      const idea = await service.getById(IDEA_2);
      expect(idea!.title).toBe("수정된 제목");
    });
  });

  // ============================================================================
  // 5. delete
  // ============================================================================

  describe("delete", () => {
    it("아이디어 삭제 후 조회 시 null", async () => {
      // 삭제용 아이디어 생성
      const id = await service.create({
        title: "삭제할 아이디어",
        ownerId: USER_ID,
        tenantId: TENANT_ID,
      });

      await service.delete(id);

      const idea = await service.getById(id);
      expect(idea).toBeNull();
    });
  });

  // ============================================================================
  // 6. getSources
  // ============================================================================

  describe("getSources", () => {
    it("radarItems JOIN 결과 반환 — title, url 등 포함", async () => {
      const sources = await service.getSources(IDEA_1);

      expect(sources).toHaveLength(1);
      expect(sources[0].radarItemId).toBe(RADAR_ITEM_1);
      expect(sources[0].title).toBe("Radar Article 1");
      expect(sources[0].titleKo).toBe("레이더 기사 1");
      expect(sources[0].url).toBe("https://example.com/1");
    });

    it("소스가 없는 아이디어 — 빈 배열", async () => {
      const sources = await service.getSources(IDEA_2);
      expect(sources).toEqual([]);
    });
  });

  // ============================================================================
  // 7. addSource
  // ============================================================================

  describe("addSource", () => {
    it("소스 연결 추가 후 getSources에서 확인", async () => {
      await service.addSource(IDEA_2, RADAR_ITEM_2);

      const sources = await service.getSources(IDEA_2);
      expect(sources).toHaveLength(1);
      expect(sources[0].radarItemId).toBe(RADAR_ITEM_2);
      expect(sources[0].title).toBe("Radar Article 2");
    });
  });

  // ============================================================================
  // 8. removeSource
  // ============================================================================

  describe("removeSource", () => {
    it("소스 연결 제거 후 getSources에서 사라짐", async () => {
      // 연결 확인
      const before = await service.getSources(IDEA_2);
      expect(before.some((s) => s.radarItemId === RADAR_ITEM_2)).toBe(true);

      await service.removeSource(IDEA_2, RADAR_ITEM_2);

      const after = await service.getSources(IDEA_2);
      expect(after.some((s) => s.radarItemId === RADAR_ITEM_2)).toBe(false);
    });

    it("존재하지 않는 연결 제거 — 에러 없이 완료", async () => {
      // 이미 없는 연결 제거 시도
      await expect(
        service.removeSource(IDEA_1, "non-existent-radar-item"),
      ).resolves.toBeUndefined();
    });
  });
});
