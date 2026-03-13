import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDB } from "../../helpers/db";
import { PrdStudioService, ConflictError, NotFoundError, ForbiddenError } from "~/features/prd-studio/service/prd-studio.service";

// ── Seed helpers ──────────────────────────────────────────────────────

const TENANT_ID = "t-analysis-api";
const USER_ID = "u-analysis-api";
const OTHER_USER_ID = "u-analysis-other";
const IDEA_ID = "idea-analysis-api";

async function seedBasicData(db: TestDB) {
  const rawDb = (db as any).session.client;
  rawDb.pragma("foreign_keys = OFF");
  rawDb.prepare("INSERT OR IGNORE INTO tenants (id, name, slug) VALUES (?, ?, ?)").run(TENANT_ID, "TestTenant", TENANT_ID);
  rawDb.prepare("INSERT OR IGNORE INTO users (id, email, name, role) VALUES (?, ?, ?, ?)").run(USER_ID, "analysis@test.com", "Test", "user");
  rawDb.prepare("INSERT OR IGNORE INTO users (id, email, name, role) VALUES (?, ?, ?, ?)").run(OTHER_USER_ID, "other@test.com", "Other", "user");
  rawDb.prepare("INSERT OR IGNORE INTO tenant_members (id, tenant_id, user_id, role) VALUES (?, ?, ?, ?)").run("tm-analysis", TENANT_ID, USER_ID, "admin");
  rawDb.prepare("INSERT OR IGNORE INTO ideas (id, tenant_id, title, owner_id) VALUES (?, ?, ?, ?)").run(IDEA_ID, TENANT_ID, "Test Idea", USER_ID);
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("PRD Analysis API — 통합 테스트 (T49-T68)", () => {
  let db: TestDB;
  let service: PrdStudioService;

  beforeEach(async () => {
    db = createTestDb();
    service = new PrdStudioService(db as any);
    await seedBasicData(db);
  });

  // === T54: 이미 PENDING → ConflictError ===
  it("T54: enqueueAnalysis — PENDING 중복 시 ConflictError", async () => {
    await service.enqueueAnalysis({
      ideaId: IDEA_ID,
      tenantId: TENANT_ID,
      requestedBy: USER_ID,
      sourceContext: "Source 1: https://example.com",
      sourceIds: ["src-1"],
    });

    await expect(
      service.enqueueAnalysis({
        ideaId: IDEA_ID,
        tenantId: TENANT_ID,
        requestedBy: USER_ID,
        sourceContext: "Source 1: https://example.com",
      sourceIds: ["src-1"],
      }),
    ).rejects.toThrow(ConflictError);
  });

  // === T55+T56: 정상 요청 → queueId + position + DB PENDING 레코드 ===
  it("T55/T56: enqueueAnalysis — 정상 큐 등록 + DB 확인", async () => {
    const result = await service.enqueueAnalysis({
      ideaId: IDEA_ID,
      tenantId: TENANT_ID,
      requestedBy: USER_ID,
      sourceContext: "Source 1: https://example.com",
      sourceIds: ["src-1"],
    });

    expect(result.queueId).toBeTruthy();
    expect(result.position).toBeGreaterThanOrEqual(1);

    const status = await service.getAnalysisStatus(IDEA_ID);
    expect(status.status).toBe("PENDING");
  });

  // === T57: 큐 없음 → none ===
  it("T57: getAnalysisStatus — 큐 없으면 none", async () => {
    const status = await service.getAnalysisStatus("idea-nonexistent");
    expect(status.status).toBe("none");
  });

  // === T58: PENDING → position 포함 ===
  it("T58: getAnalysisStatus — PENDING 상태 + position", async () => {
    await service.enqueueAnalysis({
      ideaId: IDEA_ID,
      tenantId: TENANT_ID,
      requestedBy: USER_ID,
      sourceContext: "Source 1: https://example.com",
      sourceIds: ["src-1"],
    });

    const status = await service.getAnalysisStatus(IDEA_ID);
    expect(status.status).toBe("PENDING");
    if (status.status === "PENDING") {
      expect(status.position).toBeGreaterThanOrEqual(1);
    }
  });

  // === T61: PENDING → 삭제 성공 ===
  it("T61: cancelAnalysis — PENDING 삭제", async () => {
    await service.enqueueAnalysis({
      ideaId: IDEA_ID,
      tenantId: TENANT_ID,
      requestedBy: USER_ID,
      sourceContext: "Source 1: https://example.com",
      sourceIds: ["src-1"],
    });

    await service.cancelAnalysis(IDEA_ID, USER_ID);

    const status = await service.getAnalysisStatus(IDEA_ID);
    expect(status.status).toBe("none");
  });

  // === T63: cancelAnalysis 없음 → NotFoundError ===
  it("T63: cancelAnalysis — 큐 없으면 NotFoundError", async () => {
    await expect(
      service.cancelAnalysis("idea-nonexistent", USER_ID),
    ).rejects.toThrow(NotFoundError);
  });

  // === T61b: 타인 요청 → ForbiddenError ===
  it("cancelAnalysis — 타인 요청 시 ForbiddenError", async () => {
    await service.enqueueAnalysis({
      ideaId: IDEA_ID,
      tenantId: TENANT_ID,
      requestedBy: USER_ID,
      sourceContext: "Source 1: https://example.com",
      sourceIds: ["src-1"],
    });

    await expect(
      service.cancelAnalysis(IDEA_ID, OTHER_USER_ID),
    ).rejects.toThrow(ForbiddenError);
  });

  // === T64: processNext → PROCESSING 전환 ===
  it("T64: processNext — PENDING → PROCESSING", async () => {
    await service.enqueueAnalysis({
      ideaId: IDEA_ID,
      tenantId: TENANT_ID,
      requestedBy: USER_ID,
      sourceContext: "Source 1: https://example.com",
      sourceIds: ["src-1"],
    });

    const item = await service.processNext();
    expect(item).not.toBeNull();
    expect(item!.ideaId).toBe(IDEA_ID);

    const status = await service.getAnalysisStatus(IDEA_ID);
    expect(status.status).toBe("PROCESSING");
  });

  // === T65+T66: completeAnalysis → PRD 생성 + COMPLETED ===
  it("T65/T66: completeAnalysis — PRD 생성 + COMPLETED", async () => {
    const { queueId } = await service.enqueueAnalysis({
      ideaId: IDEA_ID,
      tenantId: TENANT_ID,
      requestedBy: USER_ID,
      sourceContext: "Source 1: https://example.com",
      sourceIds: ["src-1"],
    });

    const prdId = await service.completeAnalysis(queueId, {
      title: "Generated PRD Title",
      sections: {
        summary: "요약 내용",
        background: "배경 내용",
        objectives: "목표 내용",
        target_users: "사용자 내용",
        requirements: "요구사항 내용",
        solution: "솔루션 내용",
        risks: "리스크 내용",
        timeline: "일정 내용",
      },
      review: null,
      modelVersion: "claude-sonnet-4-6",
    });

    expect(prdId).toBeTruthy();

    const status = await service.getAnalysisStatus(IDEA_ID);
    expect(status.status).toBe("COMPLETED");
    if (status.status === "COMPLETED") {
      expect(status.prdId).toBe(prdId);
    }
  });

  // === T67: failAnalysis → FAILED + error ===
  it("T67: failAnalysis — FAILED + error_message", async () => {
    const { queueId } = await service.enqueueAnalysis({
      ideaId: IDEA_ID,
      tenantId: TENANT_ID,
      requestedBy: USER_ID,
      sourceContext: "Source 1: https://example.com",
      sourceIds: ["src-1"],
    });

    await service.failAnalysis(queueId, "LLM timeout");

    const status = await service.getAnalysisStatus(IDEA_ID);
    expect(status.status).toBe("FAILED");
    if (status.status === "FAILED") {
      expect(status.error).toBe("LLM timeout");
    }
  });

  // === T68: COMPLETED 이후 status → prdId 반환 ===
  it("T68: getAnalysisStatus — COMPLETED → prdId 포함", async () => {
    const { queueId } = await service.enqueueAnalysis({
      ideaId: IDEA_ID,
      tenantId: TENANT_ID,
      requestedBy: USER_ID,
      sourceContext: "Source 1: https://example.com",
      sourceIds: ["src-1"],
    });

    const prdId = await service.completeAnalysis(queueId, {
      title: "Test PRD",
      sections: { summary: "s", background: "b", objectives: "o", target_users: "t", requirements: "r", solution: "sl", risks: "ri", timeline: "tl" },
      review: {
        verdict: "READY",
        scorecard: { totalScore: 85, items: [{ criteria: "Completeness", score: 9, maxScore: 10 }] },
        feedbackItems: [{ severity: "minor" as const, message: "Good" }],
      },
      modelVersion: "claude-sonnet-4-6",
    });

    const status = await service.getAnalysisStatus(IDEA_ID);
    expect(status.status).toBe("COMPLETED");
    if (status.status === "COMPLETED") {
      expect(status.prdId).toBe(prdId);
      expect(status.prdTitle).toBe("Test PRD");
    }
  });

  // === T64b: processNext — 빈 큐 → null ===
  it("processNext — 빈 큐 → null", async () => {
    const item = await service.processNext();
    expect(item).toBeNull();
  });

  // === T59: COMPLETED → 리뷰 결과 포함 ===
  it("T59: getAnalysisStatus — COMPLETED + 리뷰 결과 포함", async () => {
    const { queueId } = await service.enqueueAnalysis({
      ideaId: IDEA_ID,
      tenantId: TENANT_ID,
      requestedBy: USER_ID,
      sourceContext: "Source 1: https://example.com",
      sourceIds: ["src-1"],
    });

    await service.completeAnalysis(queueId, {
      title: "PRD with Review",
      sections: { summary: "s", background: "b", objectives: "o", target_users: "t", requirements: "r", solution: "sl", risks: "ri", timeline: "tl" },
      review: {
        verdict: "CONDITIONAL",
        scorecard: { totalScore: 72, items: [] },
        feedbackItems: [{ severity: "major" as const, message: "Needs improvement" }],
      },
    });

    const status = await service.getAnalysisStatus(IDEA_ID);
    expect(status.status).toBe("COMPLETED");
    if (status.status === "COMPLETED") {
      expect(status.reviewData).toBeTruthy();
    }
  });
});
