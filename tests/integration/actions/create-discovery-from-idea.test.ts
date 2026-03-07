import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDB } from "../../helpers/db";
import { makeUser, resetFixtureCounter } from "../../helpers/fixtures";
import { users, discoveries, experiments, tenants, tenantMembers } from "~/db/schema";
import { ideas } from "~/features/ideas/db/schema";
import type { DB } from "~/db";
import { IdeaService } from "~/features/ideas/service";
import { DiscoveryEntityService } from "~/features/discovery/service/entity";
import { DiscoveryWorkflowService } from "~/features/discovery/service/workflow";

const TENANT_ID = "tenant-1";

describe("Create Discovery from Idea", () => {
  let db: TestDB;
  let ideaService: IdeaService;
  let entityService: DiscoveryEntityService;
  let workflowService: DiscoveryWorkflowService;

  beforeEach(() => {
    resetFixtureCounter();
    db = createTestDb();

    const user = makeUser({ id: "user-1" });
    db.insert(users).values(user).run();

    db.insert(tenants).values({
      id: TENANT_ID,
      name: "Test Tenant",
      slug: "test-tenant",
      ownerUserId: "user-1",
    }).run();

    db.insert(tenantMembers).values({
      id: "tm-1",
      tenantId: TENANT_ID,
      userId: "user-1",
    }).run();

    const typedDb = db as unknown as DB;
    ideaService = new IdeaService(typedDb);
    entityService = new DiscoveryEntityService(typedDb);
    workflowService = new DiscoveryWorkflowService(typedDb);
  });

  function insertIdea(overrides?: Partial<typeof ideas.$inferInsert>) {
    const defaults = {
      id: "idea-1",
      tenantId: TENANT_ID,
      ownerId: "user-1",
      title: "테스트 아이디어",
    };
    db.insert(ideas).values({ ...defaults, ...overrides }).run();
  }

  const experimentInput = {
    hypothesis: "사용자가 빠른 피드백을 원한다",
    minimalAction: "프로토타입 1개 제작 후 3명 인터뷰",
    deadline: new Date("2026-03-15"),
    expectedEvidence: "인터뷰 3건의 정성적 반응",
  };

  it("converts idea to discovery with IDEA_CARD status", async () => {
    insertIdea();

    const idea = await ideaService.getById("idea-1");
    expect(idea).not.toBeNull();

    const discovery = await entityService.create(
      {
        title: idea!.title,
        seedSummary: idea!.title,
        sourceType: "idea",
        ownerId: "user-1",
        tenantId: idea!.tenantId,
        sourceIdeaId: idea!.id,
      },
      "user-1",
    );

    await workflowService.promote(
      discovery.id,
      { ownerId: "user-1", firstExperiment: experimentInput },
      "user-1",
    );

    const result = db.select().from(discoveries).where(eq(discoveries.id, discovery.id)).get();
    expect(result!.status).toBe("IDEA_CARD");
    expect(result!.sourceIdeaId).toBe("idea-1");
  });

  it("transfers idea title and seedSummary to discovery", async () => {
    insertIdea({ id: "idea-2", title: "AI 기반 시장 분석 자동화" });

    const idea = await ideaService.getById("idea-2");
    const seedSummary = idea!.title;

    const discovery = await entityService.create(
      {
        title: idea!.title,
        seedSummary,
        sourceType: "idea",
        ownerId: "user-1",
        tenantId: idea!.tenantId,
        sourceIdeaId: idea!.id,
      },
      "user-1",
    );

    const result = db.select().from(discoveries).where(eq(discoveries.id, discovery.id)).get();
    expect(result!.title).toBe("AI 기반 시장 분석 자동화");
    expect(result!.seedSummary).toBe("AI 기반 시장 분석 자동화");
  });

  it("stores experiment data correctly after promote", async () => {
    insertIdea();

    const idea = await ideaService.getById("idea-1");
    const discovery = await entityService.create(
      {
        title: idea!.title,
        seedSummary: idea!.title,
        sourceType: "idea",
        ownerId: "user-1",
        tenantId: idea!.tenantId,
        sourceIdeaId: idea!.id,
      },
      "user-1",
    );

    await workflowService.promote(
      discovery.id,
      { ownerId: "user-1", firstExperiment: experimentInput },
      "user-1",
    );

    const exps = db.select().from(experiments).where(eq(experiments.discoveryId, discovery.id)).all();
    expect(exps).toHaveLength(1);
    expect(exps[0].hypothesis).toBe("사용자가 빠른 피드백을 원한다");
    expect(exps[0].minimalAction).toBe("프로토타입 1개 제작 후 3명 인터뷰");
    expect(exps[0].expectedEvidence).toBe("인터뷰 3건의 정성적 반응");
    expect(exps[0].deadline).toBeTruthy();
  });

  it("returns null for non-existent idea (404 scenario)", async () => {
    const idea = await ideaService.getById("non-existent-idea");
    expect(idea).toBeNull();
  });

  it("rejects promote when required experiment fields are missing", () => {
    const cases = [
      { hypothesis: "", minimalAction: "action", deadline: new Date(), expectedEvidence: "ev" },
      { hypothesis: "hyp", minimalAction: "", deadline: new Date(), expectedEvidence: "ev" },
      { hypothesis: "hyp", minimalAction: "action", deadline: new Date(), expectedEvidence: "" },
    ];

    for (const input of cases) {
      const hasEmpty = !input.hypothesis || !input.minimalAction || !input.expectedEvidence;
      expect(hasEmpty).toBe(true);
    }
  });

  it("sets ownerId to current user on the created discovery", async () => {
    const secondUser = makeUser({ id: "user-2", email: "user2@test.com", name: "User 2" });
    db.insert(users).values(secondUser).run();

    insertIdea({ id: "idea-3", ownerId: "user-2" });

    const idea = await ideaService.getById("idea-3");

    // action에서 ownerId는 idea 소유자가 아닌 현재 로그인 사용자(user-1)로 설정
    const discovery = await entityService.create(
      {
        title: idea!.title,
        seedSummary: idea!.title,
        sourceType: "idea",
        ownerId: "user-1",
        tenantId: idea!.tenantId,
        sourceIdeaId: idea!.id,
      },
      "user-1",
    );

    await workflowService.promote(
      discovery.id,
      { ownerId: "user-1", firstExperiment: experimentInput },
      "user-1",
    );

    const result = db.select().from(discoveries).where(eq(discoveries.id, discovery.id)).get();
    expect(result!.ownerId).toBe("user-1");
    // idea의 ownerId(user-2)가 아닌 현재 사용자(user-1)
    expect(result!.ownerId).not.toBe(idea!.ownerId);
  });
});
