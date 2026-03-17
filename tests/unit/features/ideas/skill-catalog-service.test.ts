import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDB } from "../../../helpers/db";
import { users, tenants, tenantMembers, skillCatalog } from "~/db";
import type { DB } from "~/db";
import { SkillCatalogService } from "~/features/ideas/service/skill-catalog.service";
import type { NewSkillCatalogEntry } from "~/features/ideas/db/schema";

describe("SkillCatalogService", () => {
  let db: TestDB;
  let svc: SkillCatalogService;

  beforeEach(() => {
    db = createTestDb();
    svc = new SkillCatalogService(db as never);

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
  });

  // ─── seedCatalog ────────────────────────────────────────────────────

  describe("seedCatalog", () => {
    const seeds: NewSkillCatalogEntry[] = [
      {
        slug: "value-proposition",
        name: "가치 제안 캔버스",
        description: "JTBD 기반 가치 제안 분석",
        category: "strategy",
        inputType: "sources",
        promptTemplate: "Analyze the value proposition...",
        sortOrder: 1,
        enabled: 1,
      },
      {
        slug: "competitor-analysis",
        name: "경쟁사 분석",
        description: "경쟁 환경 분석",
        category: "market-research",
        inputType: "sources",
        promptTemplate: "Analyze competitors...",
        sortOrder: 2,
        enabled: 1,
      },
    ];

    it("새 스킬을 insert하고 upserted 수를 반환한다", async () => {
      const result = await svc.seedCatalog(seeds);
      expect(result.upserted).toBe(2);

      const all = db.select().from(skillCatalog).all();
      expect(all).toHaveLength(2);
    });

    it("같은 slug로 재호출하면 update한다 (upsert)", async () => {
      await svc.seedCatalog(seeds);

      const updated: NewSkillCatalogEntry[] = [
        {
          slug: "value-proposition",
          name: "가치 제안 캔버스 v2",
          description: "개선된 JTBD 기반 가치 제안 분석",
          category: "strategy",
          inputType: "sources",
          promptTemplate: "Analyze the value proposition v2...",
          sortOrder: 10,
          enabled: 1,
        },
      ];
      const result = await svc.seedCatalog(updated);
      expect(result.upserted).toBe(1);

      const entry = await svc.getBySlug("value-proposition");
      expect(entry).not.toBeNull();
      expect(entry!.name).toBe("가치 제안 캔버스 v2");
      expect(entry!.sortOrder).toBe(10);
      expect(entry!.promptTemplate).toBe("Analyze the value proposition v2...");
    });

    it("빈 배열은 upserted 0을 반환한다", async () => {
      const result = await svc.seedCatalog([]);
      expect(result.upserted).toBe(0);
    });
  });

  // ─── listByCategory ─────────────────────────────────────────────────

  describe("listByCategory", () => {
    beforeEach(() => {
      db.insert(skillCatalog)
        .values([
          {
            id: "sk1",
            slug: "skill-a",
            name: "Skill A",
            description: "desc A",
            category: "strategy",
            inputType: "sources",
            promptTemplate: "tpl-a",
            sortOrder: 2,
            enabled: 1,
          },
          {
            id: "sk2",
            slug: "skill-b",
            name: "Skill B",
            description: "desc B",
            category: "strategy",
            inputType: "sources",
            promptTemplate: "tpl-b",
            sortOrder: 1,
            enabled: 1,
          },
          {
            id: "sk3",
            slug: "skill-c",
            name: "Skill C",
            description: "desc C",
            category: "market-research",
            inputType: "sources",
            promptTemplate: "tpl-c",
            sortOrder: 1,
            enabled: 1,
          },
          {
            id: "sk4",
            slug: "skill-d",
            name: "Skill D (disabled)",
            description: "desc D",
            category: "strategy",
            inputType: "sources",
            promptTemplate: "tpl-d",
            sortOrder: 3,
            enabled: 0,
          },
        ])
        .run();
    });

    it("카테고리 필터를 적용하면 해당 카테고리의 활성 스킬만 반환한다", async () => {
      const list = await svc.listByCategory("strategy");
      expect(list).toHaveLength(2);
      expect(list.every((s) => s.category === "strategy")).toBe(true);
    });

    it("비활성(enabled=0) 스킬은 제외된다", async () => {
      const list = await svc.listByCategory("strategy");
      expect(list.find((s) => s.slug === "skill-d")).toBeUndefined();
    });

    it("카테고리 미지정 시 전체 활성 스킬을 반환한다", async () => {
      const list = await svc.listByCategory();
      expect(list).toHaveLength(3); // sk1, sk2, sk3 (sk4는 disabled)
    });

    it("sortOrder 기준 오름차순 정렬된다", async () => {
      const list = await svc.listByCategory("strategy");
      expect(list[0].slug).toBe("skill-b"); // sortOrder 1
      expect(list[1].slug).toBe("skill-a"); // sortOrder 2
    });

    it("존재하지 않는 카테고리는 빈 배열을 반환한다", async () => {
      const list = await svc.listByCategory("nonexistent");
      expect(list).toHaveLength(0);
    });
  });

  // ─── getBySlug ──────────────────────────────────────────────────────

  describe("getBySlug", () => {
    beforeEach(() => {
      db.insert(skillCatalog)
        .values([
          {
            id: "sk-find",
            slug: "find-me",
            name: "Find Me Skill",
            description: "desc",
            category: "strategy",
            inputType: "sources",
            promptTemplate: "tpl",
            sortOrder: 1,
            enabled: 1,
          },
        ])
        .run();
    });

    it("slug로 스킬을 조회한다", async () => {
      const skill = await svc.getBySlug("find-me");
      expect(skill).not.toBeNull();
      expect(skill!.id).toBe("sk-find");
      expect(skill!.name).toBe("Find Me Skill");
      expect(skill!.category).toBe("strategy");
    });

    it("존재하지 않는 slug는 null을 반환한다", async () => {
      const result = await svc.getBySlug("nonexistent-slug");
      expect(result).toBeNull();
    });
  });
});
