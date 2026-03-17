import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDB } from "../../../helpers/db";
import { users, tenants, tenantMembers, skillCatalog, skillExecutions, ideas } from "~/db";
import type { DB } from "~/db";
import { SkillExecutionService } from "~/features/ideas/service/skill-execution.service";
import { SkillExecStatus } from "~/features/ideas/db/schema";

describe("SkillExecutionService", () => {
  let db: TestDB;
  let svc: SkillExecutionService;

  beforeEach(() => {
    db = createTestDb();
    svc = new SkillExecutionService(db as never);

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

    db.insert(ideas)
      .values([
        { id: "idea-1", tenantId: "t1", ownerId: "u1", title: "Test Idea 1" },
        { id: "idea-2", tenantId: "t1", ownerId: "u1", title: "Test Idea 2" },
      ])
      .run();

    db.insert(skillCatalog)
      .values([
        {
          id: "sk1",
          slug: "value-proposition",
          name: "가치 제안 캔버스",
          description: "JTBD 기반 가치 제안 분석",
          category: "strategy",
          inputType: "sources",
          promptTemplate: "Analyze...",
          sortOrder: 1,
          enabled: 1,
        },
        {
          id: "sk2",
          slug: "competitor-analysis",
          name: "경쟁사 분석",
          description: "경쟁 환경 분석",
          category: "market-research",
          inputType: "sources",
          promptTemplate: "Compare...",
          sortOrder: 2,
          enabled: 1,
        },
      ])
      .run();
  });

  // ─── create ─────────────────────────────────────────────────────────

  describe("create", () => {
    it("실행을 생성하고 ID를 반환한다", async () => {
      const id = await svc.create({
        ideaId: "idea-1",
        skillId: "sk1",
        tenantId: "t1",
        executedBy: "u1",
      });
      expect(id).toBeDefined();
      expect(typeof id).toBe("string");
    });

    it("생성된 실행은 PENDING 상태이다", async () => {
      const id = await svc.create({
        ideaId: "idea-1",
        skillId: "sk1",
        tenantId: "t1",
        executedBy: "u1",
      });
      const exec = await svc.getById(id);
      expect(exec).not.toBeNull();
      expect(exec!.status).toBe(SkillExecStatus.PENDING);
      expect(exec!.ideaId).toBe("idea-1");
      expect(exec!.skillId).toBe("sk1");
    });

    it("inputContext를 포함하여 생성할 수 있다", async () => {
      const id = await svc.create({
        ideaId: "idea-1",
        skillId: "sk1",
        tenantId: "t1",
        executedBy: "u1",
        inputContext: "추가 컨텍스트 정보",
      });
      const exec = await svc.getById(id);
      expect(exec!.inputContext).toBe("추가 컨텍스트 정보");
    });

    it("inputContext 미지정 시 null이다", async () => {
      const id = await svc.create({
        ideaId: "idea-1",
        skillId: "sk1",
        tenantId: "t1",
        executedBy: "u1",
      });
      const exec = await svc.getById(id);
      expect(exec!.inputContext).toBeNull();
    });
  });

  // ─── updateStatus ───────────────────────────────────────────────────

  describe("updateStatus", () => {
    let execId: string;

    beforeEach(async () => {
      execId = await svc.create({
        ideaId: "idea-1",
        skillId: "sk1",
        tenantId: "t1",
        executedBy: "u1",
      });
    });

    it("PROCESSING으로 전환하면 startedAt이 설정된다", async () => {
      await svc.updateStatus(execId, SkillExecStatus.PROCESSING);
      const exec = await svc.getById(execId);
      expect(exec!.status).toBe(SkillExecStatus.PROCESSING);
      expect(exec!.startedAt).not.toBeNull();
    });

    it("COMPLETED로 전환하면 completedAt이 설정된다", async () => {
      await svc.updateStatus(execId, SkillExecStatus.COMPLETED, {
        resultMarkdown: "# 분석 결과\n\n성공적으로 완료",
        modelVersion: "claude-3-opus",
        tokensUsed: 1500,
        latencyMs: 3200,
      });
      const exec = await svc.getById(execId);
      expect(exec!.status).toBe(SkillExecStatus.COMPLETED);
      expect(exec!.completedAt).not.toBeNull();
      expect(exec!.resultMarkdown).toBe("# 분석 결과\n\n성공적으로 완료");
      expect(exec!.modelVersion).toBe("claude-3-opus");
      expect(exec!.tokensUsed).toBe(1500);
      expect(exec!.latencyMs).toBe(3200);
    });

    it("FAILED로 전환하면 completedAt + errorMessage가 설정된다", async () => {
      await svc.updateStatus(execId, SkillExecStatus.FAILED, {
        errorMessage: "API 호출 실패: rate limit exceeded",
      });
      const exec = await svc.getById(execId);
      expect(exec!.status).toBe(SkillExecStatus.FAILED);
      expect(exec!.completedAt).not.toBeNull();
      expect(exec!.errorMessage).toBe("API 호출 실패: rate limit exceeded");
    });

    it("resultData JSON 객체를 저장할 수 있다", async () => {
      await svc.updateStatus(execId, SkillExecStatus.COMPLETED, {
        resultData: { score: 85, tags: ["ai", "strategy"] },
        resultMarkdown: "결과",
      });
      const exec = await svc.getById(execId);
      const data = exec!.resultData as Record<string, unknown>;
      expect(data.score).toBe(85);
      expect(data.tags).toEqual(["ai", "strategy"]);
    });

    it("data 없이 상태만 전환할 수 있다", async () => {
      await svc.updateStatus(execId, SkillExecStatus.PROCESSING);
      const exec = await svc.getById(execId);
      expect(exec!.status).toBe(SkillExecStatus.PROCESSING);
      expect(exec!.resultMarkdown).toBeNull();
    });
  });

  // ─── listByIdea ─────────────────────────────────────────────────────

  describe("listByIdea", () => {
    beforeEach(async () => {
      // idea-1에 실행 2건 생성
      const id1 = await svc.create({
        ideaId: "idea-1",
        skillId: "sk1",
        tenantId: "t1",
        executedBy: "u1",
      });
      await svc.updateStatus(id1, SkillExecStatus.COMPLETED, {
        resultMarkdown: "결과 1",
      });

      const id2 = await svc.create({
        ideaId: "idea-1",
        skillId: "sk2",
        tenantId: "t1",
        executedBy: "u1",
      });
      await svc.updateStatus(id2, SkillExecStatus.PROCESSING);

      // idea-2에 실행 1건 (교차 검증용)
      await svc.create({
        ideaId: "idea-2",
        skillId: "sk1",
        tenantId: "t1",
        executedBy: "u1",
      });
    });

    it("아이디어별 실행 이력을 조회한다", async () => {
      const list = await svc.listByIdea("idea-1");
      expect(list).toHaveLength(2);
    });

    it("다른 아이디어의 실행은 포함되지 않는다", async () => {
      const list = await svc.listByIdea("idea-2");
      expect(list).toHaveLength(1);
    });

    it("skillCatalog JOIN으로 스킬명이 포함된다", async () => {
      const list = await svc.listByIdea("idea-1");
      const slugs = list.map((e) => e.skillSlug);
      expect(slugs).toContain("value-proposition");
      expect(slugs).toContain("competitor-analysis");
    });

    it("스킬 카테고리가 JOIN으로 포함된다", async () => {
      const list = await svc.listByIdea("idea-1");
      const cats = list.map((e) => e.skillCategory);
      expect(cats).toContain("strategy");
      expect(cats).toContain("market-research");
    });

    it("requestedAt 내림차순으로 정렬된다", async () => {
      const list = await svc.listByIdea("idea-1");
      for (let i = 0; i < list.length - 1; i++) {
        const curr = list[i].requestedAt?.getTime() ?? 0;
        const next = list[i + 1].requestedAt?.getTime() ?? 0;
        expect(curr).toBeGreaterThanOrEqual(next);
      }
    });

    it("존재하지 않는 아이디어는 빈 배열을 반환한다", async () => {
      const list = await svc.listByIdea("nonexistent");
      expect(list).toHaveLength(0);
    });
  });

  // ─── getById ────────────────────────────────────────────────────────

  describe("getById", () => {
    it("존재하는 실행을 조회한다", async () => {
      const id = await svc.create({
        ideaId: "idea-1",
        skillId: "sk1",
        tenantId: "t1",
        executedBy: "u1",
      });
      const exec = await svc.getById(id);
      expect(exec).not.toBeNull();
      expect(exec!.id).toBe(id);
      expect(exec!.ideaId).toBe("idea-1");
      expect(exec!.tenantId).toBe("t1");
      expect(exec!.executedBy).toBe("u1");
    });

    it("존재하지 않는 ID는 null을 반환한다", async () => {
      const result = await svc.getById("nonexistent-id");
      expect(result).toBeNull();
    });
  });
});
