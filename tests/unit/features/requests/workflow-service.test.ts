/**
 * RequirementsWorkflowService 단위 테스트
 * 대상: app/features/requests/service/workflow.ts
 *
 * - validateTransition(): 상태 전환 규칙 검증
 * - transition(): 상태 전환 실행 + 이벤트 로그
 * - startAiReview(): OPEN → AI_REVIEWING
 * - completeAiReview(): AI_REVIEWING → CLASSIFIED → HUMAN_REVIEW / REJECTED
 * - submitHumanVerdict(): HITL 판정 (APPROVED/REJECTED/NEEDS_REVISION)
 */

import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDB } from "tests/helpers/db";
import type { DB } from "~/db";
import { NotFoundError, ValidationError } from "~/lib/errors";
import { RequirementsWorkflowService } from "~/features/requests/service/workflow";
import { RequirementsEntityService } from "~/features/requests/service/entity";
import {
  featureRequests,
  requestReviews,
  requestEvents,
} from "~/features/requests/db/schema";
import { users, discoveries, alerts, tenants, tenantMembers } from "~/db";
import {
  ALLOWED_TRANSITIONS,
  RequestStatus,
  RequestClassification,
  RequestEventType,
} from "~/features/requests/constants";

let db: TestDB;
let workflow: RequirementsWorkflowService;
let entity: RequirementsEntityService;

const TENANT_ID = "t-wf-svc";
const USER_A = "user-wf-a";
const USER_B = "user-wf-b";

beforeAll(() => {
  db = createTestDb();
  workflow = new RequirementsWorkflowService(db as unknown as DB);
  entity = new RequirementsEntityService(db as unknown as DB);

  db.insert(users)
    .values([
      { id: USER_A, email: "a@wf.test", name: "작성자 A", role: "admin" },
      { id: USER_B, email: "b@wf.test", name: "리뷰어 B", role: "gatekeeper" },
    ])
    .run();

  db.insert(tenants)
    .values({ id: TENANT_ID, name: "WF Tenant", slug: "wf-test", ownerUserId: USER_A })
    .run();

  db.insert(tenantMembers)
    .values([
      { id: "tm-wf-a", tenantId: TENANT_ID, userId: USER_A },
      { id: "tm-wf-b", tenantId: TENANT_ID, userId: USER_B },
    ])
    .run();
});

/** 헬퍼: 테스트용 요구사항 시드 */
function seedRequest(id: string, status = "OPEN", submitterId = USER_A) {
  db.insert(featureRequests)
    .values({
      id,
      title: `테스트 요구사항 ${id}`,
      description: `설명 ${id}`,
      priority: "medium",
      status,
      submitterId,
    })
    .run();
}

/** 헬퍼: AI 리뷰 시드 + aiReviewId 연결 */
function seedReview(id: string, requestId: string, classification = "NEW_VALUABLE") {
  db.insert(requestReviews)
    .values({
      id,
      requestId,
      classification,
      impactScore: 4,
      feasibilityScore: 3,
      rationale: "테스트 근거",
    })
    .run();

  db.update(featureRequests)
    .set({ aiReviewId: id })
    .where(eq(featureRequests.id, requestId))
    .run();
}

// ─── validateTransition ───────────────────────

describe("validateTransition", () => {
  it("ALLOWED_TRANSITIONS에 정의된 모든 전환은 valid: true", () => {
    for (const [from, toList] of Object.entries(ALLOWED_TRANSITIONS)) {
      for (const to of toList) {
        const result = workflow.validateTransition(from, to);
        expect(result.valid, `${from} → ${to}`).toBe(true);
      }
    }
  });

  it("허용되지 않은 전환은 valid: false + 에러 메시지", () => {
    const result = workflow.validateTransition("OPEN", "ACCEPTED");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("허용되지 않습니다");
    expect(result.error).toContain("OPEN");
  });

  it("OPEN → AI_REVIEWING만 가능", () => {
    expect(workflow.validateTransition("OPEN", "AI_REVIEWING").valid).toBe(true);
    expect(workflow.validateTransition("OPEN", "ACCEPTED").valid).toBe(false);
    expect(workflow.validateTransition("OPEN", "CLASSIFIED").valid).toBe(false);
  });

  it("AI_REVIEWING → CLASSIFIED만 가능", () => {
    expect(workflow.validateTransition("AI_REVIEWING", "CLASSIFIED").valid).toBe(true);
    expect(workflow.validateTransition("AI_REVIEWING", "ACCEPTED").valid).toBe(false);
  });

  it("CLASSIFIED → HUMAN_REVIEW 또는 REJECTED 가능", () => {
    expect(workflow.validateTransition("CLASSIFIED", "HUMAN_REVIEW").valid).toBe(true);
    expect(workflow.validateTransition("CLASSIFIED", "REJECTED").valid).toBe(true);
    expect(workflow.validateTransition("CLASSIFIED", "ACCEPTED").valid).toBe(false);
  });

  it("HUMAN_REVIEW → ACCEPTED, REJECTED, CLASSIFIED 가능", () => {
    expect(workflow.validateTransition("HUMAN_REVIEW", "ACCEPTED").valid).toBe(true);
    expect(workflow.validateTransition("HUMAN_REVIEW", "REJECTED").valid).toBe(true);
    expect(workflow.validateTransition("HUMAN_REVIEW", "CLASSIFIED").valid).toBe(true);
  });

  it("ACCEPTED는 종단 상태 (어디로도 전환 불가)", () => {
    expect(workflow.validateTransition("ACCEPTED", "OPEN").valid).toBe(false);
    expect(workflow.validateTransition("ACCEPTED", "REJECTED").valid).toBe(false);
  });

  it("REJECTED → OPEN으로만 복원 가능", () => {
    expect(workflow.validateTransition("REJECTED", "OPEN").valid).toBe(true);
    expect(workflow.validateTransition("REJECTED", "ACCEPTED").valid).toBe(false);
  });

  it("알 수 없는 상태는 에러", () => {
    const result = workflow.validateTransition("UNKNOWN_STATUS", "OPEN");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("알 수 없는 상태");
  });
});

// ─── transition ───────────────────────────────

describe("transition", () => {
  it("정상 상태 전환 + 이벤트 로깅", async () => {
    seedRequest("wf-tr-1");
    const result = await workflow.transition("wf-tr-1", RequestStatus.AI_REVIEWING, USER_B);

    expect(result.from).toBe("OPEN");
    expect(result.to).toBe("AI_REVIEWING");

    // DB 상태 확인
    const [updated] = db
      .select()
      .from(featureRequests)
      .where(eq(featureRequests.id, "wf-tr-1"))
      .all();
    expect(updated.status).toBe("AI_REVIEWING");

    // 이벤트 로그 확인
    const events = db
      .select()
      .from(requestEvents)
      .where(eq(requestEvents.requestId, "wf-tr-1"))
      .all();
    expect(events.length).toBeGreaterThanOrEqual(1);
    const statusEvent = events.find((e) => e.eventType === RequestEventType.STATUS_CHANGED);
    expect(statusEvent).toBeTruthy();
    expect(statusEvent!.actorId).toBe(USER_B);
    expect(statusEvent!.payload).toEqual({ from: "OPEN", to: "AI_REVIEWING" });
  });

  it("존재하지 않는 요구사항은 에러", async () => {
    await expect(
      workflow.transition("non-existent-req", "AI_REVIEWING"),
    ).rejects.toThrow(NotFoundError);
  });

  it("허용되지 않은 전환은 에러", async () => {
    seedRequest("wf-tr-2");
    await expect(
      workflow.transition("wf-tr-2", "ACCEPTED"),
    ).rejects.toThrow(ValidationError);
  });

  it("actorId 미지정 시 actorType = system", async () => {
    seedRequest("wf-tr-3");
    await workflow.transition("wf-tr-3", RequestStatus.AI_REVIEWING);

    const events = db
      .select()
      .from(requestEvents)
      .where(eq(requestEvents.requestId, "wf-tr-3"))
      .all();
    const statusEvent = events.find((e) => e.eventType === RequestEventType.STATUS_CHANGED);
    expect(statusEvent!.actorType).toBe("system");
    expect(statusEvent!.actorId).toBeNull();
  });
});

// ─── startAiReview ────────────────────────────

describe("startAiReview", () => {
  it("OPEN → AI_REVIEWING 전환", async () => {
    seedRequest("wf-ai-1");
    const result = await workflow.startAiReview("wf-ai-1", USER_B);
    expect(result.to).toBe("AI_REVIEWING");

    const [updated] = db
      .select()
      .from(featureRequests)
      .where(eq(featureRequests.id, "wf-ai-1"))
      .all();
    expect(updated.status).toBe("AI_REVIEWING");
  });

  it("이미 AI_REVIEWING이면 에러 (중복 전환 방지)", async () => {
    seedRequest("wf-ai-2", "AI_REVIEWING");
    await expect(workflow.startAiReview("wf-ai-2")).rejects.toThrow(ValidationError);
  });
});

// ─── completeAiReview ─────────────────────────

describe("completeAiReview", () => {
  it("AI_REVIEWING → CLASSIFIED → HUMAN_REVIEW 자동 체인", async () => {
    seedRequest("wf-comp-1", "AI_REVIEWING");
    const reviewId = "rev-comp-1";

    db.insert(requestReviews)
      .values({
        id: reviewId,
        requestId: "wf-comp-1",
        classification: "NEW_VALUABLE",
        impactScore: 4,
        feasibilityScore: 3,
        rationale: "테스트",
      })
      .run();

    await workflow.completeAiReview("wf-comp-1", reviewId, "NEW_VALUABLE");

    // 최종 상태: HUMAN_REVIEW
    const [updated] = db
      .select()
      .from(featureRequests)
      .where(eq(featureRequests.id, "wf-comp-1"))
      .all();
    expect(updated.status).toBe("HUMAN_REVIEW");
    expect(updated.aiReviewId).toBe(reviewId);

    // 이벤트: AI_REVIEW_COMPLETED + STATUS_CHANGED
    const events = db
      .select()
      .from(requestEvents)
      .where(eq(requestEvents.requestId, "wf-comp-1"))
      .all();
    const eventTypes = events.map((e) => e.eventType);
    expect(eventTypes).toContain(RequestEventType.AI_REVIEW_COMPLETED);
    expect(eventTypes).toContain(RequestEventType.STATUS_CHANGED);
  });

  it("OUT_OF_SCOPE → 자동 REJECTED (사람 검토 생략)", async () => {
    seedRequest("wf-comp-2", "AI_REVIEWING");
    const reviewId = "rev-comp-2";

    db.insert(requestReviews)
      .values({
        id: reviewId,
        requestId: "wf-comp-2",
        classification: "OUT_OF_SCOPE",
        impactScore: 1,
        feasibilityScore: 1,
        rationale: "범위 밖",
      })
      .run();

    await workflow.completeAiReview("wf-comp-2", reviewId, RequestClassification.OUT_OF_SCOPE);

    const [updated] = db
      .select()
      .from(featureRequests)
      .where(eq(featureRequests.id, "wf-comp-2"))
      .all();
    expect(updated.status).toBe("REJECTED");
    expect(updated.reason).toContain("OUT_OF_SCOPE");

    // autoRejected 이벤트
    const events = db
      .select()
      .from(requestEvents)
      .where(eq(requestEvents.requestId, "wf-comp-2"))
      .all();
    const rejectEvent = events.find(
      (e) => e.eventType === RequestEventType.STATUS_CHANGED && (e.payload as Record<string, unknown>)?.autoRejected === true,
    );
    expect(rejectEvent).toBeTruthy();
  });

  it("IN_PLAN → HUMAN_REVIEW (자동 REJECTED 아님)", async () => {
    seedRequest("wf-comp-3", "AI_REVIEWING");
    const reviewId = "rev-comp-3";

    db.insert(requestReviews)
      .values({
        id: reviewId,
        requestId: "wf-comp-3",
        classification: "IN_PLAN",
        impactScore: 2,
        feasibilityScore: 2,
        rationale: "계획에 있음",
      })
      .run();

    await workflow.completeAiReview("wf-comp-3", reviewId, RequestClassification.IN_PLAN);

    const [updated] = db
      .select()
      .from(featureRequests)
      .where(eq(featureRequests.id, "wf-comp-3"))
      .all();
    expect(updated.status).toBe("HUMAN_REVIEW");
  });
});

// ─── submitHumanVerdict ───────────────────────

describe("submitHumanVerdict", () => {
  it("APPROVED → ACCEPTED 상태 전환", async () => {
    seedRequest("wf-hv-1", "HUMAN_REVIEW");
    seedReview("rev-hv-1", "wf-hv-1", RequestClassification.IN_PLAN);

    const result = await workflow.submitHumanVerdict({
      requestId: "wf-hv-1",
      verdict: "APPROVED",
      reviewerId: USER_B,
    });
    expect(result.status).toBe("ACCEPTED");

    const [updated] = db
      .select()
      .from(featureRequests)
      .where(eq(featureRequests.id, "wf-hv-1"))
      .all();
    expect(updated.status).toBe("ACCEPTED");
    expect(updated.reviewerId).toBe(USER_B);
    expect(updated.reviewedAt).toBeTruthy();
  });

  it("REJECTED → REJECTED + reason 저장", async () => {
    seedRequest("wf-hv-2", "HUMAN_REVIEW");
    seedReview("rev-hv-2", "wf-hv-2", RequestClassification.OUT_OF_SCOPE);

    const result = await workflow.submitHumanVerdict({
      requestId: "wf-hv-2",
      verdict: "REJECTED",
      comment: "범위 밖이에요",
      reviewerId: USER_B,
    });
    expect(result.status).toBe("REJECTED");

    const [updated] = db
      .select()
      .from(featureRequests)
      .where(eq(featureRequests.id, "wf-hv-2"))
      .all();
    expect(updated.reason).toBe("범위 밖이에요");
  });

  it("NEEDS_REVISION → CLASSIFIED 되돌림", async () => {
    seedRequest("wf-hv-3", "HUMAN_REVIEW");
    seedReview("rev-hv-3", "wf-hv-3");

    const result = await workflow.submitHumanVerdict({
      requestId: "wf-hv-3",
      verdict: "NEEDS_REVISION",
      reviewerId: USER_B,
    });
    expect(result.status).toBe("CLASSIFIED");

    const [updated] = db
      .select()
      .from(featureRequests)
      .where(eq(featureRequests.id, "wf-hv-3"))
      .all();
    expect(updated.status).toBe("CLASSIFIED");
  });

  it("APPROVED + NEW_VALUABLE → Discovery 자동 생성", async () => {
    seedRequest("wf-hv-4", "HUMAN_REVIEW");
    seedReview("rev-hv-4", "wf-hv-4", RequestClassification.NEW_VALUABLE);

    await workflow.submitHumanVerdict({
      requestId: "wf-hv-4",
      verdict: "APPROVED",
      reviewerId: USER_B,
    });

    // linkedDiscoveryId 설정 확인
    const [updated] = db
      .select()
      .from(featureRequests)
      .where(eq(featureRequests.id, "wf-hv-4"))
      .all();
    expect(updated.linkedDiscoveryId).toBeTruthy();

    // Discovery 레코드 확인
    const [disc] = db
      .select()
      .from(discoveries)
      .where(eq(discoveries.id, updated.linkedDiscoveryId!))
      .all();
    expect(disc).toBeTruthy();
    expect(disc.sourceType).toBe("feature_request");
    expect(disc.status).toBe("DISCOVERY");

    // DISCOVERY_LINKED 이벤트
    const events = db
      .select()
      .from(requestEvents)
      .where(eq(requestEvents.requestId, "wf-hv-4"))
      .all();
    expect(events.map((e) => e.eventType)).toContain(RequestEventType.DISCOVERY_LINKED);
  });

  it("APPROVED + ALREADY_DONE → Discovery 미생성", async () => {
    seedRequest("wf-hv-5", "HUMAN_REVIEW");
    seedReview("rev-hv-5", "wf-hv-5", RequestClassification.ALREADY_DONE);

    await workflow.submitHumanVerdict({
      requestId: "wf-hv-5",
      verdict: "APPROVED",
      reviewerId: USER_B,
    });

    const [updated] = db
      .select()
      .from(featureRequests)
      .where(eq(featureRequests.id, "wf-hv-5"))
      .all();
    expect(updated.linkedDiscoveryId).toBeNull();
  });

  it("REJECTED → 알림 생성 (제출자 ≠ 리뷰어)", async () => {
    seedRequest("wf-hv-6", "HUMAN_REVIEW", USER_A);
    seedReview("rev-hv-6", "wf-hv-6", RequestClassification.IN_PLAN);

    const alertsBefore = db.select().from(alerts).all().length;

    await workflow.submitHumanVerdict({
      requestId: "wf-hv-6",
      verdict: "REJECTED",
      comment: "보류해요",
      reviewerId: USER_B,
    });

    const alertsAfter = db.select().from(alerts).all().length;
    expect(alertsAfter).toBeGreaterThan(alertsBefore);
  });

  it("제출자 = 리뷰어면 알림 미생성", async () => {
    seedRequest("wf-hv-7", "HUMAN_REVIEW", USER_A);
    seedReview("rev-hv-7", "wf-hv-7", RequestClassification.IN_PLAN);

    const alertsBefore = db.select().from(alerts).all().length;

    await workflow.submitHumanVerdict({
      requestId: "wf-hv-7",
      verdict: "APPROVED",
      reviewerId: USER_A, // 동일 사용자
    });

    const alertsAfter = db.select().from(alerts).all().length;
    expect(alertsAfter).toBe(alertsBefore);
  });

  it("AI 리뷰 없으면 에러", async () => {
    seedRequest("wf-hv-8", "HUMAN_REVIEW");
    // 리뷰 시드 없음

    await expect(
      workflow.submitHumanVerdict({
        requestId: "wf-hv-8",
        verdict: "APPROVED",
        reviewerId: USER_B,
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it("존재하지 않는 요구사항은 에러", async () => {
    await expect(
      workflow.submitHumanVerdict({
        requestId: "non-existent-hv",
        verdict: "APPROVED",
        reviewerId: USER_B,
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it("HUMAN_VERDICT 이벤트에 verdict + comment 기록", async () => {
    seedRequest("wf-hv-9", "HUMAN_REVIEW");
    seedReview("rev-hv-9", "wf-hv-9");

    await workflow.submitHumanVerdict({
      requestId: "wf-hv-9",
      verdict: "APPROVED",
      comment: "좋아요",
      reviewerId: USER_B,
    });

    const events = db
      .select()
      .from(requestEvents)
      .where(eq(requestEvents.requestId, "wf-hv-9"))
      .all();
    const verdictEvent = events.find((e) => e.eventType === RequestEventType.HUMAN_VERDICT);
    expect(verdictEvent).toBeTruthy();
    expect(verdictEvent!.actorId).toBe(USER_B);
    expect(verdictEvent!.actorType).toBe("user");
    expect((verdictEvent!.payload as Record<string, unknown>)?.verdict).toBe("APPROVED");
    expect((verdictEvent!.payload as Record<string, unknown>)?.comment).toBe("좋아요");
  });
});
