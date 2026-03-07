import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDB } from "../../../helpers/db";
import { users, tenants, tenantMembers, radarSources, radarItems, ideas, ideaSources } from "~/db";
import { IdeaService } from "~/features/ideas/service/idea.service";

describe("IdeaService", () => {
  let db: TestDB;
  let svc: IdeaService;

  beforeEach(() => {
    db = createTestDb();
    svc = new IdeaService(db as never);

    // 시드 데이터
    db.insert(users)
      .values([{ id: "u1", email: "u1@test.com", name: "User 1", role: "user" }])
      .run();

    db.insert(tenants)
      .values([{ id: "t1", name: "Team 1", slug: "team-1", ownerUserId: "u1" }])
      .run();

    db.insert(tenantMembers)
      .values([{ id: "tm1", tenantId: "t1", userId: "u1" }])
      .run();

    db.insert(radarSources)
      .values([{ id: "rs-1", name: "src", url: "https://t.com", sourceType: "rss", tenantId: "t1" }])
      .run();

    db.insert(radarItems)
      .values([
        { id: "ri-1", sourceId: "rs-1", title: "Item 1", url: "https://a.com", urlHash: "hash-1", status: "COLLECTED" },
        { id: "ri-2", sourceId: "rs-1", title: "Item 2", url: "https://b.com", urlHash: "hash-2", status: "COLLECTED" },
      ])
      .run();
  });

  // ─── list ───────────────────────────────────────────────────────────

  describe("list", () => {
    beforeEach(async () => {
      await svc.create("t1", "u1", "Idea A");
      await svc.create("t1", "u1", "Idea B");
      await svc.create("t1", "u1", "Idea C");
    });

    it("테넌트별 아이디어 목록을 조회한다", async () => {
      const list = await svc.list("t1");
      expect(list).toHaveLength(3);
    });

    it("limit을 적용한다", async () => {
      const list = await svc.list("t1", 2);
      expect(list).toHaveLength(2);
    });

    it("다른 테넌트의 아이디어는 조회되지 않는다", async () => {
      const list = await svc.list("t-other");
      expect(list).toHaveLength(0);
    });

    it("createdAt 내림차순으로 정렬된다", async () => {
      const list = await svc.list("t1");
      for (let i = 0; i < list.length - 1; i++) {
        expect(list[i].createdAt!.getTime()).toBeGreaterThanOrEqual(
          list[i + 1].createdAt!.getTime(),
        );
      }
    });
  });

  // ─── getById ────────────────────────────────────────────────────────

  describe("getById", () => {
    it("존재하는 아이디어를 조회한다", async () => {
      const id = await svc.create("t1", "u1", "Find Me");
      const idea = await svc.getById(id);
      expect(idea).not.toBeNull();
      expect(idea!.title).toBe("Find Me");
      expect(idea!.tenantId).toBe("t1");
    });

    it("존재하지 않는 ID는 null을 반환한다", async () => {
      const result = await svc.getById("nonexistent");
      expect(result).toBeNull();
    });
  });

  // ─── create ─────────────────────────────────────────────────────────

  describe("create", () => {
    it("아이디어를 생성하고 ID를 반환한다", async () => {
      const id = await svc.create("t1", "u1", "New Idea");
      expect(id).toBeDefined();
      expect(typeof id).toBe("string");

      const idea = await svc.getById(id);
      expect(idea!.title).toBe("New Idea");
      expect(idea!.ownerId).toBe("u1");
      expect(idea!.createdByAgent).toBe(0);
    });
  });

  // ─── createFromAgent ───────────────────────────────────────────────

  describe("createFromAgent", () => {
    it("createdByAgent=1로 아이디어를 생성한다", async () => {
      const id = await svc.createFromAgent("t1", "u1", "Agent Idea");
      const idea = await svc.getById(id);
      expect(idea!.createdByAgent).toBe(1);
      expect(idea!.title).toBe("Agent Idea");
    });
  });

  // ─── updateTitle ───────────────────────────────────────────────────

  describe("updateTitle", () => {
    it("아이디어 제목을 변경한다", async () => {
      const id = await svc.create("t1", "u1", "Old Title");
      await svc.updateTitle(id, "New Title");

      const idea = await svc.getById(id);
      expect(idea!.title).toBe("New Title");
    });
  });

  // ─── delete ─────────────────────────────────────────────────────────

  describe("delete", () => {
    it("삭제 후 getById가 null을 반환한다", async () => {
      const id = await svc.create("t1", "u1", "To Delete");
      await svc.delete(id);

      const result = await svc.getById(id);
      expect(result).toBeNull();
    });
  });

  // ─── getAnalysisData ──────────────────────────────────────────────

  describe("getAnalysisData", () => {
    it("analysisData JSON 필드를 조회한다", async () => {
      const id = await svc.create("t1", "u1", "Analyzed");
      // analysisData는 JSON 컬럼 — Drizzle 자동 직렬화
      db.update(ideas)
        .set({ analysisData: { score: 85, tags: ["ai"] } as Record<string, unknown> })
        .where(require("drizzle-orm").eq(ideas.id, id))
        .run();

      const result = await svc.getAnalysisData(id);
      expect(result).not.toBeNull();
      expect(result!.title).toBe("Analyzed");
      expect((result!.analysisData as Record<string, unknown>)?.score).toBe(85);
    });

    it("존재하지 않는 아이디어는 null을 반환한다", async () => {
      const result = await svc.getAnalysisData("nonexistent");
      expect(result).toBeNull();
    });
  });

  // ─── linkSource / unlinkSource ────────────────────────────────────

  describe("linkSource", () => {
    it("소스를 연결하면 true를 반환한다", async () => {
      const id = await svc.create("t1", "u1", "Link Test");
      const result = await svc.linkSource(id, "ri-1");
      expect(result).toBe(true);
    });

    it("중복 연결 시 false를 반환한다", async () => {
      const id = await svc.create("t1", "u1", "Dup Link");
      await svc.linkSource(id, "ri-1");
      const result = await svc.linkSource(id, "ri-1");
      expect(result).toBe(false);
    });
  });

  describe("unlinkSource", () => {
    it("연결 해제 후 getLinkedSources가 빈 배열을 반환한다", async () => {
      const id = await svc.create("t1", "u1", "Unlink Test");
      await svc.linkSource(id, "ri-1");
      await svc.unlinkSource(id, "ri-1");

      const sources = await svc.getLinkedSources(id);
      expect(sources).toHaveLength(0);
    });
  });

  // ─── getLinkedSources ─────────────────────────────────────────────

  describe("getLinkedSources", () => {
    it("JOIN 결과에 radarItems 필드가 포함된다", async () => {
      const id = await svc.create("t1", "u1", "Sources Test");
      await svc.linkSource(id, "ri-1");

      const sources = await svc.getLinkedSources(id);
      expect(sources).toHaveLength(1);
      expect(sources[0].radarItemId).toBe("ri-1");
      expect(sources[0].title).toBe("Item 1");
      expect(sources[0].url).toBe("https://a.com");
    });

    it("여러 소스를 연결하면 모두 조회된다", async () => {
      const id = await svc.create("t1", "u1", "Multi Sources");
      await svc.linkSource(id, "ri-1");
      await svc.linkSource(id, "ri-2");

      const sources = await svc.getLinkedSources(id);
      expect(sources).toHaveLength(2);
    });
  });

  // ─── getLinkedSourcesDetail ───────────────────────────────────────

  describe("getLinkedSourcesDetail", () => {
    it("상세 필드 (id, title, titleKo, summaryKo, url, keyPoints, memo)를 반환한다", async () => {
      const id = await svc.create("t1", "u1", "Detail Test");
      await svc.linkSource(id, "ri-1");

      const detail = await svc.getLinkedSourcesDetail(id);
      expect(detail).toHaveLength(1);
      expect(detail[0].id).toBe("ri-1");
      expect(detail[0].title).toBe("Item 1");
      expect(detail[0].url).toBe("https://a.com");
    });
  });

  // ─── getLinkedSourcesForContext ───────────────────────────────────

  describe("getLinkedSourcesForContext", () => {
    it("limit을 적용한다", async () => {
      const id = await svc.create("t1", "u1", "Context Test");
      await svc.linkSource(id, "ri-1");
      await svc.linkSource(id, "ri-2");

      const ctx = await svc.getLinkedSourcesForContext(id, 1);
      expect(ctx).toHaveLength(1);
    });
  });
});
