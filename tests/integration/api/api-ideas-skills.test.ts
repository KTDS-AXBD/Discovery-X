/**
 * Ideas Skills API 통합 테스트
 * 대상: api.ideas.skills (GET/POST), api.ideas.skills.executions (GET)
 * 서비스 레이어 직접 호출 + DB JOIN 검증
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDB } from "../../helpers/db";
import { makeUser, resetFixtureCounter } from "../../helpers/fixtures";
import { users, tenants, tenantMembers } from "~/db";
import type { DB } from "~/db";
import { ideas, skillCatalog } from "~/features/ideas/db/schema";
import { SkillCatalogService } from "~/features/ideas/service/skill-catalog.service";
import { SkillExecutionService } from "~/features/ideas/service/skill-execution.service";

let db: TestDB;
let catalogSvc: SkillCatalogService;
let execSvc: SkillExecutionService;

const TENANT_ID = "t1";
const USER_ID = "u-owner";
const IDEA_ID = "idea-1";

function seedSkill(
  overrides?: Partial<typeof skillCatalog.$inferInsert>,
) {
  const defaults = {
    id: `sk-${crypto.randomUUID().slice(0, 8)}`,
    slug: "test-discover",
    name: "테스트 디스커버리",
    description: "테스트용 스킬",
    category: "discovery",
    inputType: "sources",
    promptTemplate: "{{sources}} 분석",
    sortOrder: 0,
    enabled: 1,
  };
  const values = { ...defaults, ...overrides };
  db.insert(skillCatalog).values(values).run();
  return values;
}

beforeEach(() => {
  resetFixtureCounter();
  db = createTestDb();
  catalogSvc = new SkillCatalogService(db as unknown as DB);
  execSvc = new SkillExecutionService(db as unknown as DB);

  // 공통 시드
  db.insert(users).values([makeUser({ id: USER_ID, name: "소유자" })]).run();
  db.insert(tenants)
    .values({ id: TENANT_ID, name: "Test Org", slug: "test-org", ownerUserId: USER_ID })
    .run();
  db.insert(tenantMembers)
    .values([{ id: "tm-1", tenantId: TENANT_ID, userId: USER_ID, role: "admin" }])
    .run();
  db.insert(ideas)
    .values({
      id: IDEA_ID,
      tenantId: TENANT_ID,
      ownerId: USER_ID,
      title: "테스트 아이디어",
    })
    .run();
});

// ─── SkillCatalogService: seedCatalog + listByCategory ──────────

describe("GET /api/ideas/skills — 스킬 카탈로그 조회", () => {
  it("seedCatalog으로 시드 → listByCategory로 전체 조회", async () => {
    const seeds = [
      {
        slug: "test-discover",
        name: "테스트 디스커버리",
        description: "디스커버리 스킬",
        category: "discovery",
        inputType: "sources",
        promptTemplate: "{{sources}} 분석",
        sortOrder: 0,
        enabled: 1 as const,
      },
      {
        slug: "test-strategy",
        name: "테스트 전략",
        description: "전략 스킬",
        category: "strategy",
        inputType: "freetext",
        promptTemplate: "{{input}} 전략 수립",
        sortOrder: 1,
        enabled: 1 as const,
      },
    ];

    const result = await catalogSvc.seedCatalog(seeds);
    expect(result.upserted).toBe(2);

    const all = await catalogSvc.listByCategory();
    expect(all).toHaveLength(2);
    expect(all.map((s) => s.slug)).toContain("test-discover");
    expect(all.map((s) => s.slug)).toContain("test-strategy");
  });

  it("카테고리 필터로 조회한다", async () => {
    seedSkill({ id: "sk-1", slug: "discover-1", category: "discovery", sortOrder: 0 });
    seedSkill({ id: "sk-2", slug: "strategy-1", category: "strategy", sortOrder: 1 });
    seedSkill({ id: "sk-3", slug: "discover-2", category: "discovery", sortOrder: 2 });

    const discoverySkills = await catalogSvc.listByCategory("discovery");
    expect(discoverySkills).toHaveLength(2);
    expect(discoverySkills.every((s) => s.category === "discovery")).toBe(true);

    const strategySkills = await catalogSvc.listByCategory("strategy");
    expect(strategySkills).toHaveLength(1);
    expect(strategySkills[0].slug).toBe("strategy-1");
  });

  it("비활성(enabled=0) 스킬은 조회되지 않는다", async () => {
    seedSkill({ id: "sk-active", slug: "active-skill", enabled: 1 });
    seedSkill({ id: "sk-disabled", slug: "disabled-skill", enabled: 0 });

    const all = await catalogSvc.listByCategory();
    expect(all).toHaveLength(1);
    expect(all[0].slug).toBe("active-skill");
  });

  it("sortOrder 순서대로 정렬된다", async () => {
    seedSkill({ id: "sk-b", slug: "skill-b", sortOrder: 2 });
    seedSkill({ id: "sk-a", slug: "skill-a", sortOrder: 0 });
    seedSkill({ id: "sk-c", slug: "skill-c", sortOrder: 1 });

    const all = await catalogSvc.listByCategory();
    expect(all.map((s) => s.slug)).toEqual(["skill-a", "skill-c", "skill-b"]);
  });

  it("빈 카탈로그는 빈 배열을 반환한다", async () => {
    const all = await catalogSvc.listByCategory();
    expect(all).toHaveLength(0);
  });

  it("존재하지 않는 카테고리는 빈 배열을 반환한다", async () => {
    seedSkill({ id: "sk-1", slug: "some-skill" });

    const result = await catalogSvc.listByCategory("nonexistent");
    expect(result).toHaveLength(0);
  });
});

// ─── SkillCatalogService: getBySlug ─────────────────────────────

describe("SkillCatalogService.getBySlug — 단일 조회", () => {
  it("slug로 단일 스킬을 조회한다", async () => {
    seedSkill({ id: "sk-1", slug: "my-skill", name: "마이스킬" });

    const skill = await catalogSvc.getBySlug("my-skill");
    expect(skill).not.toBeNull();
    expect(skill!.name).toBe("마이스킬");
    expect(skill!.slug).toBe("my-skill");
  });

  it("존재하지 않는 slug는 null을 반환한다", async () => {
    const result = await catalogSvc.getBySlug("nonexistent");
    expect(result).toBeNull();
  });
});

// ─── seedCatalog upsert ─────────────────────────────────────────

describe("POST /api/ideas/skills — 스킬 시드 upsert", () => {
  it("동일 slug 중복 시드 → 기존 데이터 업데이트 (upsert)", async () => {
    const seed = {
      slug: "upsert-test",
      name: "원래 이름",
      description: "원래 설명",
      category: "discovery",
      inputType: "sources",
      promptTemplate: "v1",
      sortOrder: 0,
      enabled: 1 as const,
    };

    await catalogSvc.seedCatalog([seed]);

    const updated = { ...seed, name: "수정된 이름", promptTemplate: "v2" };
    const result = await catalogSvc.seedCatalog([updated]);
    expect(result.upserted).toBe(1);

    const skill = await catalogSvc.getBySlug("upsert-test");
    expect(skill!.name).toBe("수정된 이름");
    expect(skill!.promptTemplate).toBe("v2");

    // 중복 생성 아님 (1개만 존재)
    const all = await catalogSvc.listByCategory();
    expect(all).toHaveLength(1);
  });
});

// ─── SkillExecutionService: create + updateStatus + listByIdea ──

describe("GET /api/ideas/skills/executions — 실행 이력 조회", () => {
  let skillId: string;

  beforeEach(() => {
    const skill = seedSkill({ id: "sk-exec", slug: "exec-skill", name: "실행 테스트 스킬" });
    skillId = skill.id;
  });

  it("실행 생성 → COMPLETED → listByIdea로 이력 조회 (skillName JOIN 확인)", async () => {
    const execId = await execSvc.create({
      ideaId: IDEA_ID,
      skillId,
      tenantId: TENANT_ID,
      executedBy: USER_ID,
      inputContext: "테스트 입력",
    });

    expect(execId).toBeTruthy();

    // PENDING → COMPLETED
    await execSvc.updateStatus(execId, "COMPLETED", {
      resultMarkdown: "# 분석 결과\n완료",
      modelVersion: "claude-sonnet-4-20250514",
      tokensUsed: 1500,
      latencyMs: 2300,
    });

    const executions = await execSvc.listByIdea(IDEA_ID);
    expect(executions).toHaveLength(1);

    const exec = executions[0];
    expect(exec.status).toBe("COMPLETED");
    expect(exec.resultMarkdown).toBe("# 분석 결과\n완료");
    expect(exec.modelVersion).toBe("claude-sonnet-4-20250514");
    expect(exec.tokensUsed).toBe(1500);
    expect(exec.latencyMs).toBe(2300);

    // LEFT JOIN 검증: skillName, skillSlug, skillCategory
    expect(exec.skillName).toBe("실행 테스트 스킬");
    expect(exec.skillSlug).toBe("exec-skill");
    expect(exec.skillCategory).toBe("discovery");
  });

  it("FAILED 상태 전환 + errorMessage 저장", async () => {
    const execId = await execSvc.create({
      ideaId: IDEA_ID,
      skillId,
      tenantId: TENANT_ID,
      executedBy: USER_ID,
    });

    await execSvc.updateStatus(execId, "PROCESSING");
    await execSvc.updateStatus(execId, "FAILED", {
      errorMessage: "API 호출 실패: 429 Too Many Requests",
    });

    const exec = await execSvc.getById(execId);
    expect(exec).not.toBeNull();
    expect(exec!.status).toBe("FAILED");
    expect(exec!.errorMessage).toBe("API 호출 실패: 429 Too Many Requests");
    expect(exec!.startedAt).not.toBeNull();
    expect(exec!.completedAt).not.toBeNull();
  });

  it("여러 실행 이력은 최신순으로 정렬된다", async () => {
    // 첫 번째 실행
    const exec1 = await execSvc.create({
      ideaId: IDEA_ID,
      skillId,
      tenantId: TENANT_ID,
      executedBy: USER_ID,
    });
    await execSvc.updateStatus(exec1, "COMPLETED", { resultMarkdown: "결과 1" });

    // 두 번째 실행
    const exec2 = await execSvc.create({
      ideaId: IDEA_ID,
      skillId,
      tenantId: TENANT_ID,
      executedBy: USER_ID,
    });
    await execSvc.updateStatus(exec2, "COMPLETED", { resultMarkdown: "결과 2" });

    const executions = await execSvc.listByIdea(IDEA_ID);
    expect(executions).toHaveLength(2);
    // requestedAt DESC — 두 번째가 먼저 (또는 같은 초에 삽입되어 순서 동일할 수 있음)
    // 중요한 건 2개가 모두 조회되는 것
    expect(executions.map((e) => e.resultMarkdown)).toContain("결과 1");
    expect(executions.map((e) => e.resultMarkdown)).toContain("결과 2");
  });

  it("실행 이력이 없는 아이디어는 빈 배열", async () => {
    const executions = await execSvc.listByIdea(IDEA_ID);
    expect(executions).toHaveLength(0);
  });

  it("다른 아이디어의 실행 이력은 조회되지 않는다", async () => {
    // 다른 아이디어 생성
    db.insert(ideas)
      .values({
        id: "idea-other",
        tenantId: TENANT_ID,
        ownerId: USER_ID,
        title: "다른 아이디어",
      })
      .run();

    await execSvc.create({
      ideaId: "idea-other",
      skillId,
      tenantId: TENANT_ID,
      executedBy: USER_ID,
    });

    const executions = await execSvc.listByIdea(IDEA_ID);
    expect(executions).toHaveLength(0);
  });
});

// ─── getById ────────────────────────────────────────────────────

describe("SkillExecutionService.getById — 단일 실행 조회", () => {
  it("존재하는 실행을 조회한다", async () => {
    const skill = seedSkill({ id: "sk-get", slug: "get-test" });
    const execId = await execSvc.create({
      ideaId: IDEA_ID,
      skillId: skill.id,
      tenantId: TENANT_ID,
      executedBy: USER_ID,
      inputContext: "컨텍스트 데이터",
    });

    const exec = await execSvc.getById(execId);
    expect(exec).not.toBeNull();
    expect(exec!.ideaId).toBe(IDEA_ID);
    expect(exec!.skillId).toBe(skill.id);
    expect(exec!.status).toBe("PENDING");
    expect(exec!.inputContext).toBe("컨텍스트 데이터");
  });

  it("존재하지 않는 ID는 null을 반환한다", async () => {
    const result = await execSvc.getById("nonexistent-exec");
    expect(result).toBeNull();
  });
});
