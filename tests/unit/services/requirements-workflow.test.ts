/**
 * RequirementsWorkflowService 단위 테스트
 * 대상: app/features/requests/service/workflow.ts
 *
 * - validateTransition(): 상태 전환 규칙 (ALLOWED_TRANSITIONS)
 * - transition(): 실행 + 이벤트 로그
 * - startAiReview(): OPEN → AI_REVIEWING
 * - completeAiReview(): AI_REVIEWING → CLASSIFIED → HUMAN_REVIEW (자동 체인)
 * - submitHumanVerdict(): HITL 판정 (APPROVED/REJECTED/NEEDS_REVISION)
 * - submitHumanVerdict() + NEW_VALUABLE: Discovery 자동 생성
 */

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "tests/helpers/db";
import type { DB } from "~/db";
import { NotFoundError, ValidationError } from "~/lib/errors";
import { RequirementsWorkflowService } from "~/features/requests/service/workflow";
import { RequirementsEntityService } from "~/features/requests/service/entity";
import { RequirementsQueryService } from "~/features/requests/service/query";
import { featureRequests, requestReviews, requestEvents } from "~/features/requests/db/schema";
import { users, discoveries, alerts, tenants, tenantMembers } from "~/db";
import { ALLOWED_TRANSITIONS, RequestStatus, RequestClassification, RequestEventType } from "~/features/requests/constants";

let db: ReturnType<typeof createTestDb>;
let workflow: RequirementsWorkflowService;
let entity: RequirementsEntityService;
let query: RequirementsQueryService;

const TENANT_ID = "t-req-wf";
const USER_A = "user-req-wf-a";
const USER_B = "user-req-wf-b";

beforeAll(() => {
  db = createTestDb();
  workflow = new RequirementsWorkflowService(db as unknown as DB);
  entity = new RequirementsEntityService(db as unknown as DB);
  query = new RequirementsQueryService(db as unknown as DB);

  db.insert(users)
    .values([
      { id: USER_A, email: "a@req.test", name: "작성자 A", role: "admin" },
      { id: USER_B, email: "b@req.test", name: "리뷰어 B", role: "gatekeeper" },
    ])
    .run();

  db.insert(tenants)
    .values({ id: TENANT_ID, name: "Req WF Tenant", slug: "req-wf", ownerUserId: USER_A })
    .run();

  db.insert(tenantMembers)
    .values([
      { id: "tm-req-wf-a", tenantId: TENANT_ID, userId: USER_A },
      { id: "tm-req-wf-b", tenantId: TENANT_ID, userId: USER_B },
    ])
    .run();
});

/** 헬퍼: 테스트용 요구사항 생성 */
function createSeedRequest(id: string, status = "OPEN", submitterId = USER_A) {
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

/** 헬퍼: AI 리뷰 시드 */
function createSeedReview(
  id: string,
  requestId: string,
  classification = "NEW_VALUABLE",
) {
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

  // aiReviewId 연결
  db.update(featureRequests)
    .set({ aiReviewId: id })
    .where(eq(featureRequests.id, requestId))
    .run();
}

// ─── validateTransition ───────────────────────

describe("validateTransition", () => {
  it("허용된 전환은 valid: true", () => {
    for (const [from, toList] of Object.entries(ALLOWED_TRANSITIONS)) {
      for (const to of toList) {
        const result = workflow.validateTransition(from, to);
        expect(result.valid, `${from} → ${to}`).toBe(true);
      }
    }
  });

  it("허용되지 않은 전환은 valid: false", () => {
    expect(workflow.validateTransition("OPEN", "ACCEPTED").valid).toBe(false);
    expect(workflow.validateTransition("ACCEPTED", "REJECTED").valid).toBe(false);
    expect(workflow.validateTransition("AI_REVIEWING", "ACCEPTED").valid).toBe(false);
  });

  it("ACCEPTED에서는 어디로도 전환 불가", () => {
    expect(workflow.validateTransition("ACCEPTED", "OPEN").valid).toBe(false);
    expect(workflow.validateTransition("ACCEPTED", "REJECTED").valid).toBe(false);
  });

  it("REJECTED에서는 OPEN으로만 전환 가능", () => {
    expect(workflow.validateTransition("REJECTED", "OPEN").valid).toBe(true);
    expect(workflow.validateTransition("REJECTED", "ACCEPTED").valid).toBe(false);
  });

  it("알 수 없는 상태는 에러", () => {
    const result = workflow.validateTransition("UNKNOWN", "OPEN");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("알 수 없는 상태");
  });
});

// ─── transition ───────────────────────────────

describe("transition", () => {
  it("OPEN → AI_REVIEWING 성공", async () => {
    createSeedRequest("req-tr-1");
    const result = await workflow.transition("req-tr-1", RequestStatus.AI_REVIEWING, USER_B);
    expect(result.from).toBe("OPEN");
    expect(result.to).toBe("AI_REVIEWING");

    // DB 확인
    const [updated] = db.select().from(featureRequests).where(eq(featureRequests.id, "req-tr-1")).all();
    expect(updated.status).toBe("AI_REVIEWING");

    // 이벤트 로그 확인
    const events = db.select().from(requestEvents).where(eq(requestEvents.requestId, "req-tr-1")).all();
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].eventType).toBe(RequestEventType.STATUS_CHANGED);
  });

  it("존재하지 않는 요구사항은 에러", async () => {
    await expect(workflow.transition("non-existent", "AI_REVIEWING")).rejects.toThrow(NotFoundError);
  });

  it("허용되지 않은 전환은 에러", async () => {
    createSeedRequest("req-tr-2");
    await expect(workflow.transition("req-tr-2", "ACCEPTED")).rejects.toThrow(ValidationError);
  });
});

// ─── startAiReview ────────────────────────────

describe("startAiReview", () => {
  it("OPEN → AI_REVIEWING 전환", async () => {
    createSeedRequest("req-ai-1");
    const result = await workflow.startAiReview("req-ai-1", USER_B);
    expect(result.to).toBe("AI_REVIEWING");
  });

  it("이미 AI_REVIEWING이면 에러", async () => {
    createSeedRequest("req-ai-2", "AI_REVIEWING");
    await expect(workflow.startAiReview("req-ai-2")).rejects.toThrow(ValidationError);
  });
});

// ─── completeAiReview ─────────────────────────

describe("completeAiReview", () => {
  it("AI_REVIEWING → CLASSIFIED → HUMAN_REVIEW 자동 체인", async () => {
    createSeedRequest("req-comp-1", "AI_REVIEWING");
    const reviewId = "review-comp-1";

    // FK 충족: request_reviews 레코드 먼저 생성
    db.insert(requestReviews)
      .values({
        id: reviewId,
        requestId: "req-comp-1",
        classification: "NEW_VALUABLE",
        impactScore: 4,
        feasibilityScore: 3,
        rationale: "테스트",
      })
      .run();

    await workflow.completeAiReview("req-comp-1", reviewId);

    // 최종 상태: HUMAN_REVIEW
    const [updated] = db.select().from(featureRequests).where(eq(featureRequests.id, "req-comp-1")).all();
    expect(updated.status).toBe("HUMAN_REVIEW");
    expect(updated.aiReviewId).toBe(reviewId);

    // 이벤트 2개: AI_REVIEW_COMPLETED + STATUS_CHANGED(CLASSIFIED→HUMAN_REVIEW)
    const events = db.select().from(requestEvents).where(eq(requestEvents.requestId, "req-comp-1")).all();
    const eventTypes = events.map((e) => e.eventType);
    expect(eventTypes).toContain(RequestEventType.AI_REVIEW_COMPLETED);
    expect(eventTypes).toContain(RequestEventType.STATUS_CHANGED);
  });
});

// ─── submitHumanVerdict ───────────────────────

describe("submitHumanVerdict", () => {
  it("APPROVED → ACCEPTED 상태 전환", async () => {
    createSeedRequest("req-hv-1", "HUMAN_REVIEW");
    createSeedReview("rev-hv-1", "req-hv-1", RequestClassification.IN_PLAN);

    const result = await workflow.submitHumanVerdict({
      requestId: "req-hv-1",
      verdict: "APPROVED",
      reviewerId: USER_B,
    });
    expect(result.status).toBe("ACCEPTED");

    const [updated] = db.select().from(featureRequests).where(eq(featureRequests.id, "req-hv-1")).all();
    expect(updated.status).toBe("ACCEPTED");
    expect(updated.reviewerId).toBe(USER_B);
  });

  it("REJECTED → REJECTED 상태 전환 + reason 저장", async () => {
    createSeedRequest("req-hv-2", "HUMAN_REVIEW");
    createSeedReview("rev-hv-2", "req-hv-2", RequestClassification.OUT_OF_SCOPE);

    const result = await workflow.submitHumanVerdict({
      requestId: "req-hv-2",
      verdict: "REJECTED",
      comment: "범위 밖입니다",
      reviewerId: USER_B,
    });
    expect(result.status).toBe("REJECTED");

    const [updated] = db.select().from(featureRequests).where(eq(featureRequests.id, "req-hv-2")).all();
    expect(updated.reason).toBe("범위 밖입니다");
  });

  it("NEEDS_REVISION → CLASSIFIED 되돌림", async () => {
    createSeedRequest("req-hv-3", "HUMAN_REVIEW");
    createSeedReview("rev-hv-3", "req-hv-3");

    const result = await workflow.submitHumanVerdict({
      requestId: "req-hv-3",
      verdict: "NEEDS_REVISION",
      reviewerId: USER_B,
    });
    expect(result.status).toBe("CLASSIFIED");
  });

  it("APPROVED + NEW_VALUABLE → Discovery 자동 생성", async () => {
    createSeedRequest("req-hv-4", "HUMAN_REVIEW");
    createSeedReview("rev-hv-4", "req-hv-4", RequestClassification.NEW_VALUABLE);

    await workflow.submitHumanVerdict({
      requestId: "req-hv-4",
      verdict: "APPROVED",
      reviewerId: USER_B,
    });

    // linkedDiscoveryId가 설정되었는지 확인
    const [updated] = db.select().from(featureRequests).where(eq(featureRequests.id, "req-hv-4")).all();
    expect(updated.linkedDiscoveryId).toBeTruthy();

    // Discovery 레코드 존재 확인
    const [disc] = db.select().from(discoveries).where(eq(discoveries.id, updated.linkedDiscoveryId!)).all();
    expect(disc).toBeTruthy();
    expect(disc.sourceType).toBe("feature_request");
    expect(disc.status).toBe("DISCOVERY");

    // DISCOVERY_LINKED 이벤트 확인
    const events = db.select().from(requestEvents).where(eq(requestEvents.requestId, "req-hv-4")).all();
    expect(events.map((e) => e.eventType)).toContain(RequestEventType.DISCOVERY_LINKED);
  });

  it("APPROVED + ALREADY_DONE → Discovery 미생성", async () => {
    createSeedRequest("req-hv-5", "HUMAN_REVIEW");
    createSeedReview("rev-hv-5", "req-hv-5", RequestClassification.ALREADY_DONE);

    await workflow.submitHumanVerdict({
      requestId: "req-hv-5",
      verdict: "APPROVED",
      reviewerId: USER_B,
    });

    const [updated] = db.select().from(featureRequests).where(eq(featureRequests.id, "req-hv-5")).all();
    expect(updated.linkedDiscoveryId).toBeNull();
  });

  it("제출자와 리뷰어가 다르면 알림 생성", async () => {
    createSeedRequest("req-hv-6", "HUMAN_REVIEW", USER_A);
    createSeedReview("rev-hv-6", "req-hv-6", RequestClassification.IN_PLAN);

    const alertsBefore = db.select().from(alerts).all().length;

    await workflow.submitHumanVerdict({
      requestId: "req-hv-6",
      verdict: "APPROVED",
      reviewerId: USER_B, // 다른 사용자
    });

    const alertsAfter = db.select().from(alerts).all().length;
    expect(alertsAfter).toBeGreaterThan(alertsBefore);
  });

  it("리뷰어=제출자면 알림 미생성", async () => {
    createSeedRequest("req-hv-7", "HUMAN_REVIEW", USER_A);
    createSeedReview("rev-hv-7", "req-hv-7", RequestClassification.IN_PLAN);

    const alertsBefore = db.select().from(alerts).all().length;

    await workflow.submitHumanVerdict({
      requestId: "req-hv-7",
      verdict: "APPROVED",
      reviewerId: USER_A, // 같은 사용자
    });

    const alertsAfter = db.select().from(alerts).all().length;
    expect(alertsAfter).toBe(alertsBefore);
  });

  it("리뷰 없으면 에러", async () => {
    createSeedRequest("req-hv-8", "HUMAN_REVIEW");
    // 리뷰 시드 없이 진행

    await expect(
      workflow.submitHumanVerdict({
        requestId: "req-hv-8",
        verdict: "APPROVED",
        reviewerId: USER_B,
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it("HUMAN_VERDICT 이벤트 로그 기록", async () => {
    createSeedRequest("req-hv-9", "HUMAN_REVIEW");
    createSeedReview("rev-hv-9", "req-hv-9");

    await workflow.submitHumanVerdict({
      requestId: "req-hv-9",
      verdict: "APPROVED",
      reviewerId: USER_B,
    });

    const events = db.select().from(requestEvents).where(eq(requestEvents.requestId, "req-hv-9")).all();
    const verdictEvent = events.find((e) => e.eventType === RequestEventType.HUMAN_VERDICT);
    expect(verdictEvent).toBeTruthy();
    expect(verdictEvent!.actorId).toBe(USER_B);
    expect(verdictEvent!.actorType).toBe("user");
  });
});
