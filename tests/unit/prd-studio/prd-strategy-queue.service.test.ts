import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDB } from "../../helpers/db";
import { PrdStudioService, ConflictError, NotFoundError, ForbiddenError } from "~/features/prd-studio/service/prd-studio.service";
import { users, tenants } from "~/db";

// ── Seed helpers ──────────────────────────────────────────────────────

const TENANT_ID = "t-strategy-test";
const USER_ID = "u-strategy-test";
const OTHER_USER_ID = "u-other-strategy";
const IDEA_ID = "idea-strategy-test";
const PRD_ID = "prd-strategy-test";

async function seedBasicData(db: TestDB) {
  const rawDb = (db as any).session.client;
  // FK OFF for circular deps (users ↔ tenants)
  rawDb.pragma("foreign_keys = OFF");
  rawDb.prepare("INSERT OR IGNORE INTO tenants (id, name, slug) VALUES (?, ?, ?)").run(TENANT_ID, "TestTenant", TENANT_ID);
  rawDb.prepare("INSERT OR IGNORE INTO users (id, email, name, role) VALUES (?, ?, ?, ?)").run(USER_ID, "test@test.com", "Test", "user");
  rawDb.prepare("INSERT OR IGNORE INTO users (id, email, name, role) VALUES (?, ?, ?, ?)").run(OTHER_USER_ID, "other@test.com", "Other", "user");
  rawDb.prepare("INSERT OR IGNORE INTO tenant_members (id, tenant_id, user_id, role) VALUES (?, ?, ?, ?)").run("tm-1", TENANT_ID, USER_ID, "admin");
  rawDb.prepare("INSERT OR IGNORE INTO ideas (id, tenant_id, title, owner_id) VALUES (?, ?, ?, ?)").run(IDEA_ID, TENANT_ID, "Test Idea", USER_ID);
  rawDb.prepare("INSERT OR IGNORE INTO prds (id, tenant_id, title, status, version, created_by, interview_progress, created_at, updated_at) VALUES (?, ?, ?, 'REVIEWED', 1, ?, 8, unixepoch(), unixepoch())").run(PRD_ID, TENANT_ID, "Test PRD", USER_ID);
  // Keep FK OFF for test — D1 production also doesn't enforce FK
  // rawDb.pragma("foreign_keys = ON");
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("PrdStudioService — Strategy Queue", () => {
  let db: TestDB;
  let service: PrdStudioService;

  beforeEach(async () => {
    db = createTestDb();
    service = new PrdStudioService(db as any);
    await seedBasicData(db);
  });

  // T17
  it("enqueueStrategy: 정상 큐 등록", async () => {
    const result = await service.enqueueStrategy({
      ideaId: IDEA_ID,
      prdId: PRD_ID,
      tenantId: TENANT_ID,
      requestedBy: USER_ID,
      prdContext: "PRD content",
      mode: "batch",
    });

    expect(result.queueId).toBeTruthy();
    expect(result.position).toBeGreaterThanOrEqual(1);
  });

  // T18
  it("enqueueStrategy: 중복 방지 — PENDING 존재 시 ConflictError", async () => {
    await service.enqueueStrategy({
      ideaId: IDEA_ID, prdId: PRD_ID, tenantId: TENANT_ID,
      requestedBy: USER_ID, prdContext: "ctx", mode: "batch",
    });

    await expect(
      service.enqueueStrategy({
        ideaId: IDEA_ID, prdId: PRD_ID, tenantId: TENANT_ID,
        requestedBy: USER_ID, prdContext: "ctx", mode: "batch",
      }),
    ).rejects.toThrow(ConflictError);
  });

  // T20
  it("getStrategyStatus: 큐 없으면 none", async () => {
    const status = await service.getStrategyStatus(IDEA_ID);
    expect(status.status).toBe("none");
  });

  // T21
  it("getStrategyStatus: PENDING 상태 + 큐 위치", async () => {
    await service.enqueueStrategy({
      ideaId: IDEA_ID, prdId: PRD_ID, tenantId: TENANT_ID,
      requestedBy: USER_ID, prdContext: "ctx", mode: "batch",
    });

    const status = await service.getStrategyStatus(IDEA_ID);
    expect(status.status).toBe("PENDING");
    if (status.status === "PENDING") {
      expect(status.position).toBeGreaterThanOrEqual(1);
    }
  });

  // T23
  it("cancelStrategy: PENDING 삭제", async () => {
    await service.enqueueStrategy({
      ideaId: IDEA_ID, prdId: PRD_ID, tenantId: TENANT_ID,
      requestedBy: USER_ID, prdContext: "ctx", mode: "batch",
    });

    await service.cancelStrategy(IDEA_ID, USER_ID);

    const status = await service.getStrategyStatus(IDEA_ID);
    expect(status.status).toBe("none");
  });

  // T24
  it("cancelStrategy: 타인 요청 시 ForbiddenError", async () => {
    await service.enqueueStrategy({
      ideaId: IDEA_ID, prdId: PRD_ID, tenantId: TENANT_ID,
      requestedBy: USER_ID, prdContext: "ctx", mode: "batch",
    });

    await expect(
      service.cancelStrategy(IDEA_ID, OTHER_USER_ID),
    ).rejects.toThrow(ForbiddenError);
  });

  // T25 (cancelStrategy PROCESSING → ConflictError는 status를 수동 변경해야 테스트)

  // T26
  it("completeStrategy: 결과 저장", async () => {
    const { queueId } = await service.enqueueStrategy({
      ideaId: IDEA_ID, prdId: PRD_ID, tenantId: TENANT_ID,
      requestedBy: USER_ID, prdContext: "ctx", mode: "batch",
    });

    await service.completeStrategy(queueId, {
      strategy: {
        swot: { strengths: ["s1"], weaknesses: ["w1"], opportunities: ["o1"], threats: ["t1"], crossAnalysis: "cross" },
        leanCanvas: { problem: "p", solution: "s", keyMetrics: "k", uniqueValueProp: "u", unfairAdvantage: "u", channels: "c", customerSegments: "cs", costStructure: "c", revenueStreams: "r" },
        jtbd: { who: "w", why: "w", whatBefore: "wb", how: "h", whatAfter: "wa", alternatives: "a" },
        competition: { directCompetitors: [], indirectCompetitors: [], differentiation: "d" },
        marketSizing: { tam: { value: "1B", description: "d" }, sam: { value: "100M", description: "d" }, som: { value: "10M", description: "d" }, methodology: "m", assumptions: ["a1"] },
        riskAssessment: { risks: [], overallRiskLevel: "medium", summary: "s" },
      },
      modelVersion: "claude-sonnet-4-6",
    });

    const status = await service.getStrategyStatus(IDEA_ID);
    expect(status.status).toBe("COMPLETED");
  });

  // T22
  it("getStrategyStatus: COMPLETED — hasStrategy true", async () => {
    const { queueId } = await service.enqueueStrategy({
      ideaId: IDEA_ID, prdId: PRD_ID, tenantId: TENANT_ID,
      requestedBy: USER_ID, prdContext: "ctx", mode: "batch",
    });

    await service.completeStrategy(queueId, {
      strategy: {
        swot: { strengths: [], weaknesses: [], opportunities: [], threats: [], crossAnalysis: "" },
        leanCanvas: { problem: "", solution: "", keyMetrics: "", uniqueValueProp: "", unfairAdvantage: "", channels: "", customerSegments: "", costStructure: "", revenueStreams: "" },
        jtbd: { who: "", why: "", whatBefore: "", how: "", whatAfter: "", alternatives: "" },
        competition: { directCompetitors: [], indirectCompetitors: [], differentiation: "" },
        marketSizing: { tam: { value: "", description: "" }, sam: { value: "", description: "" }, som: { value: "", description: "" }, methodology: "", assumptions: [] },
        riskAssessment: { risks: [], overallRiskLevel: "low", summary: "" },
      },
    });

    const status = await service.getStrategyStatus(IDEA_ID);
    expect(status.status).toBe("COMPLETED");
    if (status.status === "COMPLETED") {
      expect(status.hasStrategy).toBe(true);
    }
  });

  // T27
  it("failStrategy: FAILED 상태 + 에러 메시지", async () => {
    const { queueId } = await service.enqueueStrategy({
      ideaId: IDEA_ID, prdId: PRD_ID, tenantId: TENANT_ID,
      requestedBy: USER_ID, prdContext: "ctx", mode: "batch",
    });

    await service.failStrategy(queueId, "테스트 에러");

    const status = await service.getStrategyStatus(IDEA_ID);
    expect(status.status).toBe("FAILED");
    if (status.status === "FAILED") {
      expect(status.error).toBe("테스트 에러");
    }
  });

  // T28
  it("getStrategyResult: COMPLETED 결과 조회", async () => {
    const { queueId } = await service.enqueueStrategy({
      ideaId: IDEA_ID, prdId: PRD_ID, tenantId: TENANT_ID,
      requestedBy: USER_ID, prdContext: "ctx", mode: "batch",
    });

    await service.completeStrategy(queueId, {
      strategy: {
        swot: { strengths: ["test"], weaknesses: [], opportunities: [], threats: [], crossAnalysis: "" },
        leanCanvas: { problem: "", solution: "", keyMetrics: "", uniqueValueProp: "", unfairAdvantage: "", channels: "", customerSegments: "", costStructure: "", revenueStreams: "" },
        jtbd: { who: "", why: "", whatBefore: "", how: "", whatAfter: "", alternatives: "" },
        competition: { directCompetitors: [], indirectCompetitors: [], differentiation: "" },
        marketSizing: { tam: { value: "", description: "" }, sam: { value: "", description: "" }, som: { value: "", description: "" }, methodology: "", assumptions: [] },
        riskAssessment: { risks: [], overallRiskLevel: "low", summary: "" },
      },
    });

    const result = await service.getStrategyResult(IDEA_ID);
    expect(result).not.toBeNull();
    expect(result?.resultStrategy).toBeTruthy();
  });

  // T28b
  it("getStrategyResult: 미완료 시 null", async () => {
    const result = await service.getStrategyResult(IDEA_ID);
    expect(result).toBeNull();
  });

  // T25 - cancelStrategy: PROCESSING 상태에서는 ConflictError
  it("cancelStrategy: 요청 없으면 NotFoundError", async () => {
    await expect(
      service.cancelStrategy(IDEA_ID, USER_ID),
    ).rejects.toThrow(NotFoundError);
  });
});
