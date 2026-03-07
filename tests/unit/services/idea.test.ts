/**
 * IdeaService 단위 테스트
 *
 * 대상: app/features/ideas/service/idea.service.ts
 * - list, getById, create, createFromAgent, updateTitle, delete
 * - getAnalysisData, linkSource, unlinkSource, getLinkedSources
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { createTestDb } from "tests/helpers/db";
import type { DB } from "~/db";
import { IdeaService } from "~/features/ideas/service/idea.service";
import { users, tenants, tenantMembers, radarSources, radarRuns, radarItems } from "~/db";
import { ideas, ideaSources } from "~/features/ideas/db/schema";
import { eq } from "drizzle-orm";

let db: ReturnType<typeof createTestDb>;
let service: IdeaService;

const TENANT_ID = "tenant-idea-test";
const USER_ID = "user-idea-1";
const OTHER_USER_ID = "user-idea-2";
const RADAR_ITEM_ID = "ri-idea-1";
const RADAR_ITEM_ID_2 = "ri-idea-2";

function seedFixtures() {
  db.insert(users)
    .values([
      { id: USER_ID, email: "owner@test.com", name: "Owner", role: "admin" },
      { id: OTHER_USER_ID, email: "other@test.com", name: "Other", role: "user" },
    ])
    .run();

  db.insert(tenants)
    .values({ id: TENANT_ID, name: "Test Tenant", slug: "test-tenant", ownerUserId: USER_ID })
    .run();

  db.insert(tenantMembers)
    .values({ id: "tm-idea-1", tenantId: TENANT_ID, userId: USER_ID })
    .run();

  // radarItems에 필요한 radarSources + radarRuns 먼저 삽입
  db.insert(radarSources)
    .values({ id: "rs-idea-1", tenantId: TENANT_ID, name: "Test Source", url: "https://example.com/feed", type: "rss", sourceType: "rss" })
    .run();

  db.insert(radarRuns)
    .values({ id: "rr-idea-1", sourceId: "rs-idea-1", tenantId: TENANT_ID, status: "completed", itemCount: 2 })
    .run();

  db.insert(radarItems)
    .values([
      {
        id: RADAR_ITEM_ID,
        runId: "rr-idea-1",
        sourceId: "rs-idea-1",
        tenantId: TENANT_ID,
        title: "Test Article 1",
        url: "https://example.com/1",
        urlHash: "hash-idea-1",
        status: "new",
      },
      {
        id: RADAR_ITEM_ID_2,
        runId: "rr-idea-1",
        sourceId: "rs-idea-1",
        tenantId: TENANT_ID,
        title: "Test Article 2",
        url: "https://example.com/2",
        urlHash: "hash-idea-2",
        status: "new",
      },
    ])
    .run();
}

describe("IdeaService", () => {
  beforeAll(() => {
    db = createTestDb();
    service = new IdeaService(db as unknown as DB);
    seedFixtures();
  });

  // ==========================================================================
  // Ideas CRUD
  // ==========================================================================

  describe("create", () => {
    it("새 아이디어를 생성하고 ID를 반환한다", async () => {
      const id = await service.create(TENANT_ID, USER_ID, "Test Idea");
      expect(id).toBeTruthy();
      expect(typeof id).toBe("string");

      const created = await service.getById(id);
      expect(created).not.toBeNull();
      expect(created!.title).toBe("Test Idea");
      expect(created!.tenantId).toBe(TENANT_ID);
      expect(created!.ownerId).toBe(USER_ID);
      expect(created!.createdByAgent).toBe(0);
    });
  });

  describe("createFromAgent", () => {
    it("AI 에이전트 생성 플래그가 1로 설정된다", async () => {
      const id = await service.createFromAgent(TENANT_ID, USER_ID, "Agent Idea");
      const created = await service.getById(id);
      expect(created).not.toBeNull();
      expect(created!.createdByAgent).toBe(1);
    });
  });

  describe("list", () => {
    it("테넌트별 아이디어 목록을 반환한다", async () => {
      const list = await service.list(TENANT_ID);
      expect(list.length).toBeGreaterThanOrEqual(2);
      // 최신 순 정렬 확인
      for (let i = 1; i < list.length; i++) {
        expect(list[i - 1].createdAt! >= list[i].createdAt!).toBe(true);
      }
    });

    it("limit 파라미터가 동작한다", async () => {
      const list = await service.list(TENANT_ID, 1);
      expect(list.length).toBe(1);
    });

    it("다른 테넌트의 아이디어는 포함하지 않는다", async () => {
      const list = await service.list("non-existent-tenant");
      expect(list.length).toBe(0);
    });
  });

  describe("getById", () => {
    it("존재하는 아이디어를 반환한다", async () => {
      const id = await service.create(TENANT_ID, USER_ID, "Get By Id Test");
      const result = await service.getById(id);
      expect(result).not.toBeNull();
      expect(result!.id).toBe(id);
    });

    it("존재하지 않는 ID는 null을 반환한다", async () => {
      const result = await service.getById("non-existent-id");
      expect(result).toBeNull();
    });
  });

  describe("updateTitle", () => {
    it("아이디어 제목을 수정한다", async () => {
      const id = await service.create(TENANT_ID, USER_ID, "Original Title");
      await service.updateTitle(id, "Updated Title");

      const updated = await service.getById(id);
      expect(updated!.title).toBe("Updated Title");
    });
  });

  describe("delete", () => {
    it("아이디어를 삭제한다", async () => {
      const id = await service.create(TENANT_ID, USER_ID, "To Delete");
      await service.delete(id);

      const deleted = await service.getById(id);
      expect(deleted).toBeNull();
    });
  });

  describe("getAnalysisData", () => {
    it("title과 analysisData를 반환한다", async () => {
      const id = await service.create(TENANT_ID, USER_ID, "Analysis Test");
      const result = await service.getAnalysisData(id);
      expect(result).not.toBeNull();
      expect(result!.title).toBe("Analysis Test");
    });

    it("존재하지 않는 ID는 null을 반환한다", async () => {
      const result = await service.getAnalysisData("non-existent");
      expect(result).toBeNull();
    });
  });

  // ==========================================================================
  // Source Links
  // ==========================================================================

  describe("linkSource", () => {
    it("소스를 아이디어에 연결한다", async () => {
      const ideaId = await service.create(TENANT_ID, USER_ID, "Link Test");
      const linked = await service.linkSource(ideaId, RADAR_ITEM_ID);
      expect(linked).toBe(true);
    });

    it("중복 링크는 false를 반환한다", async () => {
      const ideaId = await service.create(TENANT_ID, USER_ID, "Dup Link Test");
      await service.linkSource(ideaId, RADAR_ITEM_ID);
      const dup = await service.linkSource(ideaId, RADAR_ITEM_ID);
      expect(dup).toBe(false);
    });
  });

  describe("unlinkSource", () => {
    it("소스 연결을 해제한다", async () => {
      const ideaId = await service.create(TENANT_ID, USER_ID, "Unlink Test");
      await service.linkSource(ideaId, RADAR_ITEM_ID);
      await service.unlinkSource(ideaId, RADAR_ITEM_ID);

      const sources = await service.getLinkedSources(ideaId);
      expect(sources.length).toBe(0);
    });
  });

  describe("getLinkedSources", () => {
    it("연결된 소스 목록을 radarItem 정보와 함께 반환한다", async () => {
      const ideaId = await service.create(TENANT_ID, USER_ID, "Sources Test");
      await service.linkSource(ideaId, RADAR_ITEM_ID);
      await service.linkSource(ideaId, RADAR_ITEM_ID_2);

      const sources = await service.getLinkedSources(ideaId);
      expect(sources.length).toBe(2);
      expect(sources[0].title).toBeTruthy();
      expect(sources[0].url).toBeTruthy();
    });
  });

  describe("getLinkedSourcesDetail", () => {
    it("상세 소스 정보를 반환한다", async () => {
      const ideaId = await service.create(TENANT_ID, USER_ID, "Detail Test");
      await service.linkSource(ideaId, RADAR_ITEM_ID);

      const sources = await service.getLinkedSourcesDetail(ideaId);
      expect(sources.length).toBe(1);
      expect(sources[0].id).toBe(RADAR_ITEM_ID);
    });
  });

  describe("getLinkedSourcesForContext", () => {
    it("컨텍스트용 소스 정보를 반환한다", async () => {
      const ideaId = await service.create(TENANT_ID, USER_ID, "Context Test");
      await service.linkSource(ideaId, RADAR_ITEM_ID);

      const sources = await service.getLinkedSourcesForContext(ideaId);
      expect(sources.length).toBe(1);
      expect(sources[0].title).toBeTruthy();
    });

    it("limit 파라미터가 동작한다", async () => {
      const ideaId = await service.create(TENANT_ID, USER_ID, "Limit Test");
      await service.linkSource(ideaId, RADAR_ITEM_ID);
      await service.linkSource(ideaId, RADAR_ITEM_ID_2);

      const sources = await service.getLinkedSourcesForContext(ideaId, 1);
      expect(sources.length).toBe(1);
    });
  });
});
