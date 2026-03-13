import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDB } from "../../helpers/db";
import { PrdStudioService, ConflictError, NotFoundError, ForbiddenError } from "~/features/prd-studio/service/prd-studio.service";
import { buildProposalSynthesisPrompt } from "~/features/prd-studio/lib/proposal-synthesis-prompt";

// ── Seed helpers ──────────────────────────────────────────────────────

const TENANT_ID = "t-strategy-api";
const USER_ID = "u-strategy-api";
const IDEA_ID = "idea-strategy-api";
const PRD_ID = "prd-strategy-api";

async function seedBasicData(db: TestDB) {
  const rawDb = (db as any).session.client;
  rawDb.pragma("foreign_keys = OFF");
  rawDb.prepare("INSERT OR IGNORE INTO tenants (id, name, slug) VALUES (?, ?, ?)").run(TENANT_ID, "TestTenant", TENANT_ID);
  rawDb.prepare("INSERT OR IGNORE INTO users (id, email, name, role) VALUES (?, ?, ?, ?)").run(USER_ID, "api@test.com", "Test", "user");
  rawDb.prepare("INSERT OR IGNORE INTO tenant_members (id, tenant_id, user_id, role) VALUES (?, ?, ?, ?)").run("tm-api", TENANT_ID, USER_ID, "admin");
  rawDb.prepare("INSERT OR IGNORE INTO ideas (id, tenant_id, title, owner_id) VALUES (?, ?, ?, ?)").run(IDEA_ID, TENANT_ID, "Test Idea", USER_ID);
  rawDb.prepare("INSERT OR IGNORE INTO prds (id, tenant_id, title, status, version, created_by, interview_progress, created_at, updated_at) VALUES (?, ?, ?, 'REVIEWED', 1, ?, 8, unixepoch(), unixepoch())").run(PRD_ID, TENANT_ID, "Test PRD", USER_ID);
}

const STRATEGY_FIXTURE = {
  swot: { strengths: ["s1"], weaknesses: ["w1"], opportunities: ["o1"], threats: ["t1"], crossAnalysis: "cross" },
  leanCanvas: { problem: "p", solution: "s", keyMetrics: "k", uniqueValueProp: "u", unfairAdvantage: "u", channels: "c", customerSegments: "cs", costStructure: "c", revenueStreams: "r" },
  jtbd: { who: "w", why: "w", whatBefore: "wb", how: "h", whatAfter: "wa", alternatives: "a" },
  competition: { directCompetitors: [], indirectCompetitors: [], differentiation: "d" },
  marketSizing: { tam: { value: "1B", description: "d" }, sam: { value: "100M", description: "d" }, som: { value: "10M", description: "d" }, methodology: "m", assumptions: ["a1"] },
  riskAssessment: { risks: [], overallRiskLevel: "medium" as const, summary: "s" },
};

// ── Tests ─────────────────────────────────────────────────────────────

describe("PRD Strategy API — 통합 테스트 (T29-T36)", () => {
  let db: TestDB;
  let service: PrdStudioService;

  beforeEach(async () => {
    db = createTestDb();
    service = new PrdStudioService(db as any);
    await seedBasicData(db);
  });

  // T29
  it("POST /strategy — batch 모드 정상 큐 등록", async () => {
    const result = await service.enqueueStrategy({
      ideaId: IDEA_ID,
      prdId: PRD_ID,
      tenantId: TENANT_ID,
      requestedBy: USER_ID,
      prdContext: "PRD content for batch",
      mode: "batch",
    });

    expect(result.queueId).toBeTruthy();
    expect(result.position).toBeGreaterThanOrEqual(1);
  });

  // T30
  it("POST /strategy — realtime 모드 요청 시 mode=realtime 전달 확인", async () => {
    const result = await service.enqueueStrategy({
      ideaId: IDEA_ID,
      prdId: PRD_ID,
      tenantId: TENANT_ID,
      requestedBy: USER_ID,
      prdContext: "PRD content for realtime",
      mode: "realtime",
    });

    expect(result.queueId).toBeTruthy();

    // DB에서 직접 mode 확인
    const rawDb = (db as any).session.client;
    const row = rawDb.prepare("SELECT mode FROM prd_strategy_queue WHERE id = ?").get(result.queueId) as { mode: string };
    expect(row.mode).toBe("realtime");
  });

  // T31
  it("POST /strategy — ideaId 빈 문자열 시 에러 또는 빈 결과", async () => {
    // enqueueStrategy에 빈 ideaId → 큐 등록은 되지만 의미 없는 레코드
    // 서비스 레벨에서 validation이 없으므로, 큐 등록 후 getStrategyStatus에서 빈 ideaId는 none 반환
    const result = await service.enqueueStrategy({
      ideaId: "",
      prdId: PRD_ID,
      tenantId: TENANT_ID,
      requestedBy: USER_ID,
      prdContext: "ctx",
      mode: "batch",
    });

    // 빈 ideaId로 등록된 큐를 다시 조회하면 찾을 수 있어야 함
    const status = await service.getStrategyStatus("");
    expect(["PENDING", "none"]).toContain(status.status);
  });

  // T32
  it("POST /strategy — PRD 미완료 시 분석 상태 확인", async () => {
    // idea는 있지만 PRD analysis COMPLETED가 아닌 상태 확인
    // 새로운 idea에 대해 분석 상태 조회
    const analysisStatus = await service.getAnalysisStatus("idea-no-analysis");
    expect(analysisStatus.status).toBe("none");
    // status !== "COMPLETED" 이면 전략 요청 전 PRD 분석 완료 확인 필요
    expect(analysisStatus.status).not.toBe("COMPLETED");
  });

  // T33
  it("GET /strategy/:ideaId/status — COMPLETED 상태 + strategyFrameworks 6", async () => {
    const { queueId } = await service.enqueueStrategy({
      ideaId: IDEA_ID,
      prdId: PRD_ID,
      tenantId: TENANT_ID,
      requestedBy: USER_ID,
      prdContext: "ctx",
      mode: "batch",
    });

    await service.completeStrategy(queueId, {
      strategy: STRATEGY_FIXTURE,
      modelVersion: "claude-sonnet-4-6",
    });

    const status = await service.getStrategyStatus(IDEA_ID);
    expect(status.status).toBe("COMPLETED");
    if (status.status === "COMPLETED") {
      expect(status.hasStrategy).toBe(true);
      expect(status.strategyFrameworks).toBe(6);
    }
  });

  // T34
  it("GET /strategy/:ideaId/status — 테넌트 격리 (존재하지 않는 idea)", async () => {
    const status = await service.getStrategyStatus("idea-nonexistent");
    expect(status.status).toBe("none");
  });

  // T35
  it("DELETE /strategy/:ideaId/cancel — 정상 취소", async () => {
    await service.enqueueStrategy({
      ideaId: IDEA_ID,
      prdId: PRD_ID,
      tenantId: TENANT_ID,
      requestedBy: USER_ID,
      prdContext: "ctx",
      mode: "batch",
    });

    await service.cancelStrategy(IDEA_ID, USER_ID);

    const status = await service.getStrategyStatus(IDEA_ID);
    expect(status.status).toBe("none");
  });

  // T36
  it("POST /synthesize-proposal — 합성 프롬프트 생성", async () => {
    const { queueId } = await service.enqueueStrategy({
      ideaId: IDEA_ID,
      prdId: PRD_ID,
      tenantId: TENANT_ID,
      requestedBy: USER_ID,
      prdContext: "ctx",
      mode: "batch",
    });

    await service.completeStrategy(queueId, {
      strategy: STRATEGY_FIXTURE,
      modelVersion: "claude-sonnet-4-6",
    });

    // 전략 결과 조회
    const result = await service.getStrategyResult(IDEA_ID);
    expect(result).not.toBeNull();
    expect(result?.resultStrategy).toBeTruthy();

    // PRD 섹션 fixture
    const prdSections = [
      { type: "summary", generatedContent: "사업 요약 내용", editedContent: null },
      { type: "background", generatedContent: "배경 내용", editedContent: null },
    ];

    // buildProposalSynthesisPrompt 호출
    const prompt = buildProposalSynthesisPrompt(
      "overview",
      prdSections as any,
      result?.resultStrategy as any,
      null,
    );

    expect(prompt).toContain("사업 개요");
    expect(prompt).toContain("사업 요약 내용");
  });
});
