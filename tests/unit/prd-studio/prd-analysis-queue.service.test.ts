import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDB } from "../../helpers/db";
import { PrdStudioService, ConflictError, NotFoundError, ForbiddenError } from "~/features/prd-studio/service/prd-studio.service";
import { prds, prdSections, prdReviews, prdAnalysisQueue } from "~/features/prd-studio/db/schema";
import { users } from "~/db";

// ============================================================================
// Test Helpers
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getSqlite(db: TestDB) { return (db as any).session.client; }

function seedBase(db: TestDB, userId = "user-1", tenantId = "tenant-1") {
  const sqlite = getSqlite(db);
  sqlite.pragma("foreign_keys = OFF");
  sqlite.prepare("INSERT OR IGNORE INTO users (id, email, name, role) VALUES (?, ?, 'Tester', 'member')").run(userId, `${userId}@test.com`);
  sqlite.prepare("INSERT OR IGNORE INTO tenants (id, name, slug, owner_user_id) VALUES (?, 'Test', ?, ?)").run(tenantId, tenantId, userId);
  sqlite.prepare("INSERT OR IGNORE INTO tenant_members (id, tenant_id, user_id, role) VALUES (?, ?, ?, 'member')").run(`tm-${userId}`, tenantId, userId);
  sqlite.pragma("foreign_keys = ON");
}

function seedIdea(db: TestDB, id = "idea-1", tenantId = "tenant-1", ownerId = "user-1") {
  const sqlite = getSqlite(db);
  sqlite.prepare("INSERT OR IGNORE INTO ideas (id, tenant_id, owner_id, title, status, created_at, updated_at) VALUES (?, ?, ?, 'Test Idea', 'ACTIVE', unixepoch(), unixepoch())").run(id, tenantId, ownerId);
}

// ============================================================================
// Tests
// ============================================================================

describe("PrdStudioService — Analysis Queue", () => {
  let db: TestDB;
  let service: PrdStudioService;

  beforeEach(() => {
    db = createTestDb();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new PrdStudioService(db as any);
    seedBase(db);
    seedIdea(db);
  });

  // ────────────── enqueueAnalysis ──────────────

  describe("enqueueAnalysis()", () => {
    const validInput = {
      ideaId: "idea-1",
      tenantId: "tenant-1",
      requestedBy: "user-1",
      sourceContext: "### 소스 1: SaaS 동향\n요약: 시장 성장 중",
      sourceIds: ["src-1", "src-2"],
    };

    // T5: 정상 요청 → PENDING 레코드 생성
    it("T5: 정상 요청 → PENDING 레코드 생성, queueId 반환", async () => {
      const result = await service.enqueueAnalysis(validInput);

      expect(result.queueId).toBeTruthy();
      expect(result.position).toBeGreaterThanOrEqual(1);

      const record = db
        .select()
        .from(prdAnalysisQueue)
        .where(eq(prdAnalysisQueue.id, result.queueId))
        .get();
      expect(record).toBeTruthy();
      expect(record!.status).toBe("PENDING");
      expect(record!.ideaId).toBe("idea-1");
    });

    // T3: 이미 PENDING/PROCESSING 큐 존재 → ConflictError
    it("T3: 이미 PENDING 큐 존재 → ConflictError", async () => {
      await service.enqueueAnalysis(validInput);
      await expect(service.enqueueAnalysis(validInput)).rejects.toThrow(ConflictError);
    });

    // T6: sourceContext 저장 확인
    it("T6: sourceContext에 소스 텍스트 포함 확인", async () => {
      const result = await service.enqueueAnalysis(validInput);
      const record = db.select().from(prdAnalysisQueue).where(eq(prdAnalysisQueue.id, result.queueId)).get();

      expect(record!.sourceContext).toContain("SaaS 동향");
    });

    // T7: sourceIds JSON 배열 저장
    it("T7: sourceIds JSON 배열 저장", async () => {
      const result = await service.enqueueAnalysis(validInput);
      const record = db.select().from(prdAnalysisQueue).where(eq(prdAnalysisQueue.id, result.queueId)).get();

      expect(record!.sourceIds).toEqual(["src-1", "src-2"]);
    });
  });

  // ────────────── getAnalysisStatus ──────────────

  describe("getAnalysisStatus()", () => {
    // T8: 큐 항목 없음 → { status: "none" }
    it("T8: 큐 항목 없음 → none", async () => {
      const status = await service.getAnalysisStatus("idea-1");
      expect(status.status).toBe("none");
    });

    // T9: PENDING → position 포함
    it("T9: PENDING → position 포함", async () => {
      await service.enqueueAnalysis({
        ideaId: "idea-1",
        tenantId: "tenant-1",
        requestedBy: "user-1",
        sourceContext: "ctx",
        sourceIds: [],
      });

      const status = await service.getAnalysisStatus("idea-1");
      expect(status.status).toBe("PENDING");
      if (status.status === "PENDING") {
        expect(status.position).toBeGreaterThanOrEqual(1);
        expect(status.queueId).toBeTruthy();
      }
    });

    // T10: PROCESSING → startedAt 포함
    it("T10: PROCESSING → startedAt 포함", async () => {
      await service.enqueueAnalysis({
        ideaId: "idea-1",
        tenantId: "tenant-1",
        requestedBy: "user-1",
        sourceContext: "ctx",
        sourceIds: [],
      });
      await service.processNext();

      const status = await service.getAnalysisStatus("idea-1");
      expect(status.status).toBe("PROCESSING");
      if (status.status === "PROCESSING") {
        expect(status.startedAt).toBeTruthy();
      }
    });

    // T11: COMPLETED → prdId 포함
    it("T11: COMPLETED → prdId 포함", async () => {
      const { queueId } = await service.enqueueAnalysis({
        ideaId: "idea-1",
        tenantId: "tenant-1",
        requestedBy: "user-1",
        sourceContext: "ctx",
        sourceIds: [],
      });
      await service.processNext();
      await service.completeAnalysis(queueId, {
        title: "Test PRD",
        sections: { summary: "s", background: "b", objectives: "o", target_users: "t", requirements: "r", solution: "sol", risks: "rsk", timeline: "tl" },
        review: null,
      });

      const status = await service.getAnalysisStatus("idea-1");
      expect(status.status).toBe("COMPLETED");
      if (status.status === "COMPLETED") {
        expect(status.prdId).toBeTruthy();
      }
    });

    // T12: FAILED → error 포함
    it("T12: FAILED → error 포함", async () => {
      const { queueId } = await service.enqueueAnalysis({
        ideaId: "idea-1",
        tenantId: "tenant-1",
        requestedBy: "user-1",
        sourceContext: "ctx",
        sourceIds: [],
      });
      await service.processNext();
      await service.failAnalysis(queueId, "timeout");

      const status = await service.getAnalysisStatus("idea-1");
      expect(status.status).toBe("FAILED");
      if (status.status === "FAILED") {
        expect(status.error).toBe("timeout");
      }
    });
  });

  // ────────────── cancelAnalysis ──────────────

  describe("cancelAnalysis()", () => {
    // T13: PENDING 상태 → 삭제 성공
    it("T13: PENDING → 삭제 성공", async () => {
      await service.enqueueAnalysis({
        ideaId: "idea-1",
        tenantId: "tenant-1",
        requestedBy: "user-1",
        sourceContext: "ctx",
        sourceIds: [],
      });

      await service.cancelAnalysis("idea-1", "user-1");
      const status = await service.getAnalysisStatus("idea-1");
      // 삭제 후 status는 none 또는 이전 COMPLETED/FAILED 항목
      expect(["none", "COMPLETED", "FAILED"]).toContain(status.status);
    });

    // T14: PROCESSING 상태 → 취소 불가
    it("T14: PROCESSING → ConflictError", async () => {
      await service.enqueueAnalysis({
        ideaId: "idea-1",
        tenantId: "tenant-1",
        requestedBy: "user-1",
        sourceContext: "ctx",
        sourceIds: [],
      });
      await service.processNext();

      await expect(service.cancelAnalysis("idea-1", "user-1")).rejects.toThrow(ConflictError);
    });

    // T16: 다른 사용자의 큐 → ForbiddenError
    it("T16: 다른 사용자 → ForbiddenError", async () => {
      seedBase(db, "user-2", "tenant-1");
      await service.enqueueAnalysis({
        ideaId: "idea-1",
        tenantId: "tenant-1",
        requestedBy: "user-1",
        sourceContext: "ctx",
        sourceIds: [],
      });

      await expect(service.cancelAnalysis("idea-1", "user-2")).rejects.toThrow(ForbiddenError);
    });
  });

  // ────────────── processNext ──────────────

  describe("processNext()", () => {
    // T17: PENDING 없음 → null
    it("T17: PENDING 없음 → null", async () => {
      const result = await service.processNext();
      expect(result).toBeNull();
    });

    // T18: 가장 오래된 PENDING → PROCESSING 전환
    it("T18: 가장 오래된 PENDING → PROCESSING 전환 + 레코드 반환", async () => {
      await service.enqueueAnalysis({
        ideaId: "idea-1",
        tenantId: "tenant-1",
        requestedBy: "user-1",
        sourceContext: "first",
        sourceIds: [],
      });

      const result = await service.processNext();
      expect(result).toBeTruthy();
      expect(result!.sourceContext).toBe("first");

      // DB에서 PROCESSING 확인
      const record = db.select().from(prdAnalysisQueue).where(eq(prdAnalysisQueue.id, result!.id)).get();
      expect(record!.status).toBe("PROCESSING");
    });
  });

  // ────────────── completeAnalysis ──────────────

  describe("completeAnalysis()", () => {
    // T20-T25: 정상 완료 처리
    it("T20-T25: 정상 완료 — PRD + sections + reviews 생성", async () => {
      const { queueId } = await service.enqueueAnalysis({
        ideaId: "idea-1",
        tenantId: "tenant-1",
        requestedBy: "user-1",
        sourceContext: "ctx",
        sourceIds: ["src-1"],
      });
      await service.processNext();

      const prdId = await service.completeAnalysis(queueId, {
        title: "클라우드 HR SaaS PRD",
        sections: {
          summary: "## 프로젝트 요약\nSaaS",
          background: "## 배경\nHR",
          objectives: "## 목표\nMAU",
          target_users: "## 대상\n담당자",
          requirements: "## 요구사항\nP0",
          solution: "## 해결\nAI",
          risks: "## 리스크\n규제",
          timeline: "## 일정\n3개월",
        },
        review: {
          verdict: "CONDITIONAL",
          scorecard: { totalScore: 72, items: [{ criteria: "문제 정의", score: 8, maxScore: 10 }] },
          feedbackItems: [{ section: "risks", severity: "critical", message: "규제 누락" }],
        },
        modelVersion: "claude-sonnet-4-6",
      });

      // T21: PRD 생성 확인
      const prd = db.select().from(prds).where(eq(prds.id, prdId)).get();
      expect(prd).toBeTruthy();
      expect(prd!.title).toBe("클라우드 HR SaaS PRD");
      expect(prd!.status).toBe("REVIEWED");

      // T22: 8개 sections 확인
      const sections = db.select().from(prdSections).where(eq(prdSections.prdId, prdId)).all();
      expect(sections).toHaveLength(8);
      const summary = sections.find((s) => s.type === "summary");
      expect(summary!.generatedContent).toContain("프로젝트 요약");

      // T23: review 저장 확인
      const reviews = db.select().from(prdReviews).where(eq(prdReviews.prdId, prdId)).all();
      expect(reviews).toHaveLength(1);
      expect(reviews[0].verdict).toBe("CONDITIONAL");
      expect(reviews[0].model).toBe("claude-sonnet-4-6");

      // T24: sourceIdeaId 연결 확인
      expect(prd!.sourceIdeaId).toBe("idea-1");

      // T25: 큐 prd_id 업데이트 확인
      const queue = db.select().from(prdAnalysisQueue).where(eq(prdAnalysisQueue.id, queueId)).get();
      expect(queue!.prdId).toBe(prdId);
      expect(queue!.status).toBe("COMPLETED");
    });
  });

  // ────────────── failAnalysis ──────────────

  describe("failAnalysis()", () => {
    // T26-T27: 실패 처리
    it("T26-T27: FAILED 상태 전환 + error_message + completedAt", async () => {
      const { queueId } = await service.enqueueAnalysis({
        ideaId: "idea-1",
        tenantId: "tenant-1",
        requestedBy: "user-1",
        sourceContext: "ctx",
        sourceIds: [],
      });
      await service.processNext();
      await service.failAnalysis(queueId, "claude -p timeout");

      const record = db.select().from(prdAnalysisQueue).where(eq(prdAnalysisQueue.id, queueId)).get();
      expect(record!.status).toBe("FAILED");
      expect(record!.errorMessage).toBe("claude -p timeout");
      expect(record!.completedAt).toBeTruthy();
    });
  });
});
