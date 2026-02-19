import { describe, it, expect, beforeAll } from "vitest";
import { createTestDb } from "tests/helpers/db";
import type { DB } from "~/db";
import { RecallTrackingService } from "~/lib/services/recall-tracking.service";
import { eventLogs, users, discoveries, tenants, tenantMembers } from "~/db/schema";
import { eq } from "drizzle-orm";

let db: ReturnType<typeof createTestDb>;
let service: RecallTrackingService;

const TEST_TENANT = "test-tenant-recall";
const TEST_USER_ID = "test-user-recall-1";
const TEST_DISC_HOLD = "test-disc-hold-1";
const TEST_DISC_DROP = "test-disc-drop-1";

beforeAll(() => {
  db = createTestDb();
  service = new RecallTrackingService(db as unknown as DB);

  // 테스트용 사용자 삽입
  db.insert(users).values({
    id: TEST_USER_ID,
    email: "recall-test@test.com",
    name: "Recall Test User",
    role: "admin",
  }).run();

  // 테스트용 Tenant 삽입 (FK 충족)
  db.insert(tenants).values({
    id: TEST_TENANT,
    name: "Recall Test Tenant",
    slug: "recall-test-tenant",
    ownerUserId: TEST_USER_ID,
  }).run();

  db.insert(tenantMembers).values({
    id: "tm-recall-1",
    tenantId: TEST_TENANT,
    userId: TEST_USER_ID,
  }).run();

  // 테스트용 Discovery 삽입 (HOLD 상태)
  db.insert(discoveries).values({
    id: TEST_DISC_HOLD,
    title: "Hold Discovery",
    seedSummary: "Test summary for hold",
    status: "HOLD",
    sourceType: "other",
    ownerId: TEST_USER_ID,
    tenantId: TEST_TENANT,
    createdAt: new Date(),
    updatedAt: new Date(),
  }).run();

  // 테스트용 Discovery 삽입 (DROP 상태)
  db.insert(discoveries).values({
    id: TEST_DISC_DROP,
    title: "Drop Discovery",
    seedSummary: "Test summary for drop",
    status: "DROP",
    sourceType: "other",
    ownerId: TEST_USER_ID,
    tenantId: TEST_TENANT,
    createdAt: new Date(),
    updatedAt: new Date(),
  }).run();
});

// ============================================================================
// 1. logHoldDecision
// ============================================================================

describe("RecallTrackingService", () => {
  it("logHoldDecision — HOLD_DECIDED 이벤트 기록", async () => {
    await service.logHoldDecision({
      discoveryId: TEST_DISC_HOLD,
      actorId: TEST_USER_ID,
      triggerType: "Technology_Maturity",
      triggerCondition: "GPT-5 출시 후 재검토",
      revisitDate: "2026-06-01",
    });

    const logs = db
      .select()
      .from(eventLogs)
      .where(eq(eventLogs.eventType, "HOLD_DECIDED"))
      .all();

    expect(logs).toHaveLength(1);
    expect(logs[0].discoveryId).toBe(TEST_DISC_HOLD);
    expect(logs[0].actorId).toBe(TEST_USER_ID);

    const metadata = logs[0].metadata as Record<string, unknown>;
    expect(metadata.triggerType).toBe("Technology_Maturity");
    expect(metadata.triggerCondition).toBe("GPT-5 출시 후 재검토");
    expect(metadata.revisitDate).toBe("2026-06-01");
  });

  // ============================================================================
  // 2. logDropDecision
  // ============================================================================

  it("logDropDecision — DROP_DECIDED 이벤트 + metadata 검증", async () => {
    await service.logDropDecision({
      discoveryId: TEST_DISC_DROP,
      actorId: TEST_USER_ID,
      failurePatterns: ["예산 부재", "데이터 접근 불가"],
      evidenceReason: "내부 데이터 API 접근 권한 미확보",
    });

    const logs = db
      .select()
      .from(eventLogs)
      .where(eq(eventLogs.eventType, "DROP_DECIDED"))
      .all();

    expect(logs).toHaveLength(1);
    expect(logs[0].discoveryId).toBe(TEST_DISC_DROP);

    const metadata = logs[0].metadata as Record<string, unknown>;
    expect(metadata.failurePatterns).toEqual(["예산 부재", "데이터 접근 불가"]);
    expect(metadata.evidenceReason).toBe("내부 데이터 API 접근 권한 미확보");
  });

  // ============================================================================
  // 3. logRecallTriggered
  // ============================================================================

  it("logRecallTriggered — RECALL_TRIGGERED 이벤트 기록", async () => {
    await service.logRecallTriggered({
      discoveryId: TEST_DISC_HOLD,
      actorId: TEST_USER_ID,
      triggerType: "revisit_date",
    });

    const logs = db
      .select()
      .from(eventLogs)
      .where(eq(eventLogs.eventType, "RECALL_TRIGGERED"))
      .all();

    expect(logs).toHaveLength(1);
    expect(logs[0].discoveryId).toBe(TEST_DISC_HOLD);

    const metadata = logs[0].metadata as Record<string, unknown>;
    expect(metadata.triggerType).toBe("revisit_date");
  });

  // ============================================================================
  // 4. logRecallReviewed
  // ============================================================================

  it("logRecallReviewed — RECALL_REVIEWED 이벤트 + fromStatus/toStatus 검증", async () => {
    await service.logRecallReviewed({
      discoveryId: TEST_DISC_HOLD,
      actorId: TEST_USER_ID,
      fromStatus: "HOLD",
      toStatus: "IDEA_CARD",
    });

    const logs = db
      .select()
      .from(eventLogs)
      .where(eq(eventLogs.eventType, "RECALL_REVIEWED"))
      .all();

    expect(logs).toHaveLength(1);

    const metadata = logs[0].metadata as Record<string, unknown>;
    expect(metadata.fromStatus).toBe("HOLD");
    expect(metadata.toStatus).toBe("IDEA_CARD");
  });

  // ============================================================================
  // 5. logFailurePatternReused
  // ============================================================================

  it("logFailurePatternReused — FAILURE_PATTERN_REUSED 이벤트 + patterns 검증", async () => {
    await service.logFailurePatternReused({
      discoveryId: TEST_DISC_HOLD,
      actorId: TEST_USER_ID,
      referencedDiscoveryId: TEST_DISC_DROP,
      patterns: ["예산 부재", "운영 책임 불명확"],
    });

    const logs = db
      .select()
      .from(eventLogs)
      .where(eq(eventLogs.eventType, "FAILURE_PATTERN_REUSED"))
      .all();

    expect(logs).toHaveLength(1);

    const metadata = logs[0].metadata as Record<string, unknown>;
    expect(metadata.referencedDiscoveryId).toBe(TEST_DISC_DROP);
    expect(metadata.patterns).toEqual(["예산 부재", "운영 책임 불명확"]);
  });

  // ============================================================================
  // 6. getRecallStats — 통계 집계 정확성
  // ============================================================================

  it("getRecallStats — 이벤트 집계 정확성 검증", async () => {
    // 위 테스트에서 이미 5개 이벤트가 삽입됨
    // HOLD_DECIDED: 1, DROP_DECIDED: 1, RECALL_TRIGGERED: 1, RECALL_REVIEWED: 1, FAILURE_PATTERN_REUSED: 1
    const stats = await service.getRecallStats(TEST_TENANT);

    expect(stats.totalHoldDecisions).toBe(1);
    expect(stats.totalDropDecisions).toBe(1);
    expect(stats.totalRecallTriggered).toBe(1);
    expect(stats.totalRecallReviewed).toBe(1);
    expect(stats.totalPatternReuses).toBe(1);
    expect(stats.monthlyBreakdown.length).toBeGreaterThanOrEqual(1);
  });

  // ============================================================================
  // 7. getRecallStats — 빈 데이터 시 0 반환
  // ============================================================================

  it("getRecallStats — 존재하지 않는 tenant 시 0 반환", async () => {
    const stats = await service.getRecallStats("non-existent-tenant");

    expect(stats.totalHoldDecisions).toBe(0);
    expect(stats.totalDropDecisions).toBe(0);
    expect(stats.totalRecallTriggered).toBe(0);
    expect(stats.totalRecallReviewed).toBe(0);
    expect(stats.totalPatternReuses).toBe(0);
    expect(stats.monthlyBreakdown).toEqual([]);
  });

  // ============================================================================
  // 8. getRecallStats — 날짜 필터 동작 확인
  // ============================================================================

  it("getRecallStats — 날짜 필터로 범위 제한", async () => {
    // 미래 날짜로 필터하면 결과 0
    const futureStats = await service.getRecallStats(TEST_TENANT, {
      fromDate: new Date("2099-01-01"),
    });

    expect(futureStats.totalHoldDecisions).toBe(0);
    expect(futureStats.totalDropDecisions).toBe(0);
    expect(futureStats.totalRecallTriggered).toBe(0);
    expect(futureStats.monthlyBreakdown).toEqual([]);

    // 과거~현재 범위로 필터하면 결과 포함
    const currentStats = await service.getRecallStats(TEST_TENANT, {
      fromDate: new Date("2020-01-01"),
      toDate: new Date("2099-12-31"),
    });

    expect(currentStats.totalHoldDecisions).toBe(1);
    expect(currentStats.totalRecallTriggered).toBe(1);
  });
});
