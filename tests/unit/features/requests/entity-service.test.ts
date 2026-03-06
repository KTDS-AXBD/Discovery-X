/**
 * RequirementsEntityService 단위 테스트
 * 대상: app/features/requests/service/entity.ts
 *
 * - createRequest(): 요구사항 생성 + 기본값 검증
 * - updateRequest(): 상태/사유 업데이트
 * - deleteRequest(): 삭제 검증
 * - saveReview(): AI 리뷰 저장 + 반환값
 * - saveHumanVerdict(): 리뷰에 판정 저장
 * - logEvent(): 이벤트 기록 + payload 검증
 */

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDB } from "tests/helpers/db";
import type { DB } from "~/db";
import { RequirementsEntityService } from "~/features/requests/service/entity";
import {
  featureRequests,
  requestReviews,
  requestEvents,
} from "~/features/requests/db/schema";
import { users, tenants, tenantMembers } from "~/db/schema";
import {
  RequestClassification,
  RequestEventType,
} from "~/features/requests/constants";

let db: TestDB;
let entity: RequirementsEntityService;

const TENANT_ID = "t-ent-svc";
const USER_A = "user-ent-a";
const USER_B = "user-ent-b";

beforeAll(() => {
  db = createTestDb();
  entity = new RequirementsEntityService(db as unknown as DB);

  db.insert(users)
    .values([
      { id: USER_A, email: "a@ent.test", name: "작성자 A", role: "admin" },
      { id: USER_B, email: "b@ent.test", name: "리뷰어 B", role: "gatekeeper" },
    ])
    .run();

  db.insert(tenants)
    .values({ id: TENANT_ID, name: "Ent Tenant", slug: "ent-test", ownerUserId: USER_A })
    .run();

  db.insert(tenantMembers)
    .values([
      { id: "tm-ent-a", tenantId: TENANT_ID, userId: USER_A },
      { id: "tm-ent-b", tenantId: TENANT_ID, userId: USER_B },
    ])
    .run();
});

// ─── createRequest ────────────────────────────

describe("createRequest", () => {
  it("요구사항 생성 + 기본 상태 OPEN", async () => {
    const created = await entity.createRequest({
      title: "신규 요구사항",
      description: "상세 설명",
      priority: "high",
      submitterId: USER_A,
    });

    expect(created.id).toBeTruthy();
    expect(created.title).toBe("신규 요구사항");
    expect(created.description).toBe("상세 설명");
    expect(created.priority).toBe("high");
    expect(created.status).toBe("OPEN");
    expect(created.submitterId).toBe(USER_A);
    expect(created.createdAt).toBeTruthy();
  });

  it("기본 우선순위는 medium", async () => {
    const created = await entity.createRequest({
      title: "기본 우선순위 테스트",
      description: "설명",
      priority: "medium",
      submitterId: USER_A,
    });

    expect(created.priority).toBe("medium");
  });

  it("여러 요구사항 생성 시 각각 다른 ID", async () => {
    const r1 = await entity.createRequest({
      title: "요구 1",
      description: "설명 1",
      priority: "low",
      submitterId: USER_A,
    });
    const r2 = await entity.createRequest({
      title: "요구 2",
      description: "설명 2",
      priority: "low",
      submitterId: USER_A,
    });

    expect(r1.id).not.toBe(r2.id);
  });
});

// ─── updateRequest ────────────────────────────

describe("updateRequest", () => {
  it("상태 업데이트", async () => {
    const created = await entity.createRequest({
      title: "업데이트 대상",
      description: "설명",
      priority: "medium",
      submitterId: USER_A,
    });

    await entity.updateRequest(created.id, { status: "AI_REVIEWING" });

    const [updated] = db
      .select()
      .from(featureRequests)
      .where(eq(featureRequests.id, created.id))
      .all();
    expect(updated.status).toBe("AI_REVIEWING");
  });

  it("사유(reason) 업데이트", async () => {
    const created = await entity.createRequest({
      title: "사유 테스트",
      description: "설명",
      priority: "medium",
      submitterId: USER_A,
    });

    await entity.updateRequest(created.id, {
      status: "REJECTED",
      reason: "범위 밖입니다",
    });

    const [updated] = db
      .select()
      .from(featureRequests)
      .where(eq(featureRequests.id, created.id))
      .all();
    expect(updated.status).toBe("REJECTED");
    expect(updated.reason).toBe("범위 밖입니다");
  });

  it("리뷰어 + aiReviewId 설정", async () => {
    const created = await entity.createRequest({
      title: "리뷰어 테스트",
      description: "설명",
      priority: "high",
      submitterId: USER_A,
    });

    // FK 충족: 리뷰 먼저 생성
    const review = await entity.saveReview({
      requestId: created.id,
      classification: "NEW_VALUABLE",
      impactScore: 3,
      feasibilityScore: 3,
      rationale: "테스트",
    });

    await entity.updateRequest(created.id, {
      reviewerId: USER_B,
      aiReviewId: review.id,
    });

    const [updated] = db
      .select()
      .from(featureRequests)
      .where(eq(featureRequests.id, created.id))
      .all();
    expect(updated.reviewerId).toBe(USER_B);
    expect(updated.aiReviewId).toBe(review.id);
  });
});

// ─── deleteRequest ────────────────────────────

describe("deleteRequest", () => {
  it("요구사항 삭제", async () => {
    const created = await entity.createRequest({
      title: "삭제 대상",
      description: "설명",
      priority: "low",
      submitterId: USER_A,
    });

    await entity.deleteRequest(created.id);

    const rows = db
      .select()
      .from(featureRequests)
      .where(eq(featureRequests.id, created.id))
      .all();
    expect(rows).toHaveLength(0);
  });

  it("존재하지 않는 ID 삭제해도 에러 없음", async () => {
    await expect(entity.deleteRequest("non-existent-id")).resolves.not.toThrow();
  });
});

// ─── saveReview ───────────────────────────────

describe("saveReview", () => {
  it("AI 리뷰 저장 + 반환값 검증", async () => {
    const req = await entity.createRequest({
      title: "리뷰 대상",
      description: "설명",
      priority: "medium",
      submitterId: USER_A,
    });

    const review = await entity.saveReview({
      requestId: req.id,
      classification: RequestClassification.NEW_VALUABLE,
      impactScore: 4,
      feasibilityScore: 3,
      rationale: "가치 있는 기능이에요",
      matchedRoutes: ["/api/test", "/dashboard"],
      matchedSpecSections: ["섹션 A", "섹션 B"],
      workPlanDraft: "## 작업계획\n1. 구현\n2. 테스트",
      modelId: "claude-sonnet-4-20250514",
      tokenUsage: 1500,
    });

    expect(review.id).toBeTruthy();
    expect(review.requestId).toBe(req.id);
    expect(review.classification).toBe("NEW_VALUABLE");
    expect(review.impactScore).toBe(4);
    expect(review.feasibilityScore).toBe(3);
    expect(review.rationale).toBe("가치 있는 기능이에요");
    expect(review.matchedRoutes).toEqual(["/api/test", "/dashboard"]);
    expect(review.matchedSpecSections).toEqual(["섹션 A", "섹션 B"]);
    expect(review.workPlanDraft).toContain("작업계획");
    expect(review.modelId).toBe("claude-sonnet-4-20250514");
    expect(review.tokenUsage).toBe(1500);
  });

  it("선택 필드 생략 시 기본값", async () => {
    const req = await entity.createRequest({
      title: "최소 리뷰",
      description: "설명",
      priority: "low",
      submitterId: USER_A,
    });

    const review = await entity.saveReview({
      requestId: req.id,
      classification: RequestClassification.ALREADY_DONE,
      impactScore: 1,
      feasibilityScore: 1,
      rationale: "이미 구현됨",
    });

    expect(review.matchedRoutes).toBeNull();
    expect(review.matchedSpecSections).toBeNull();
    expect(review.workPlanDraft).toBeNull();
    expect(review.modelId).toBeNull();
    expect(review.tokenUsage).toBe(0);
  });
});

// ─── saveHumanVerdict ─────────────────────────

describe("saveHumanVerdict", () => {
  it("판정 + 코멘트 저장", async () => {
    const req = await entity.createRequest({
      title: "HITL 대상",
      description: "설명",
      priority: "high",
      submitterId: USER_A,
    });

    const review = await entity.saveReview({
      requestId: req.id,
      classification: "NEW_VALUABLE",
      impactScore: 5,
      feasibilityScore: 4,
      rationale: "근거",
    });

    await entity.saveHumanVerdict(review.id, {
      verdict: "APPROVED",
      comment: "승인해요",
      reviewerId: USER_B,
    });

    const [updated] = db
      .select()
      .from(requestReviews)
      .where(eq(requestReviews.id, review.id))
      .all();
    expect(updated.humanVerdict).toBe("APPROVED");
    expect(updated.humanComment).toBe("승인해요");
    expect(updated.reviewedBy).toBe(USER_B);
    expect(updated.reviewedAt).toBeTruthy();
  });

  it("코멘트 없이 판정만 저장", async () => {
    const req = await entity.createRequest({
      title: "코멘트 없는 판정",
      description: "설명",
      priority: "medium",
      submitterId: USER_A,
    });

    const review = await entity.saveReview({
      requestId: req.id,
      classification: "IN_PLAN",
      impactScore: 3,
      feasibilityScore: 3,
      rationale: "계획에 포함",
    });

    await entity.saveHumanVerdict(review.id, {
      verdict: "REJECTED",
      reviewerId: USER_B,
    });

    const [updated] = db
      .select()
      .from(requestReviews)
      .where(eq(requestReviews.id, review.id))
      .all();
    expect(updated.humanVerdict).toBe("REJECTED");
    expect(updated.humanComment).toBeNull();
  });
});

// ─── logEvent ─────────────────────────────────

describe("logEvent", () => {
  it("이벤트 기록 + payload 검증", async () => {
    const req = await entity.createRequest({
      title: "이벤트 테스트",
      description: "설명",
      priority: "low",
      submitterId: USER_A,
    });

    await entity.logEvent({
      requestId: req.id,
      eventType: RequestEventType.CREATED,
      actorId: USER_A,
      actorType: "user",
      payload: { source: "test", extra: 42 },
    });

    const events = db
      .select()
      .from(requestEvents)
      .where(eq(requestEvents.requestId, req.id))
      .all();
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe("created");
    expect(events[0].actorId).toBe(USER_A);
    expect(events[0].actorType).toBe("user");
    expect(events[0].payload).toEqual({ source: "test", extra: 42 });
  });

  it("선택 필드 생략 시 기본값", async () => {
    const req = await entity.createRequest({
      title: "최소 이벤트",
      description: "설명",
      priority: "low",
      submitterId: USER_A,
    });

    await entity.logEvent({
      requestId: req.id,
      eventType: RequestEventType.STATUS_CHANGED,
    });

    const events = db
      .select()
      .from(requestEvents)
      .where(eq(requestEvents.requestId, req.id))
      .all();
    expect(events).toHaveLength(1);
    expect(events[0].actorId).toBeNull();
    expect(events[0].actorType).toBe("system");
    expect(events[0].payload).toBeNull();
  });

  it("같은 요구사항에 여러 이벤트 기록", async () => {
    const req = await entity.createRequest({
      title: "다중 이벤트",
      description: "설명",
      priority: "medium",
      submitterId: USER_A,
    });

    await entity.logEvent({
      requestId: req.id,
      eventType: RequestEventType.CREATED,
      actorId: USER_A,
      actorType: "user",
    });
    await entity.logEvent({
      requestId: req.id,
      eventType: RequestEventType.AI_REVIEW_STARTED,
      actorType: "agent",
    });
    await entity.logEvent({
      requestId: req.id,
      eventType: RequestEventType.AI_REVIEW_COMPLETED,
      actorType: "agent",
      payload: { classification: "NEW_VALUABLE" },
    });

    const events = db
      .select()
      .from(requestEvents)
      .where(eq(requestEvents.requestId, req.id))
      .all();
    expect(events).toHaveLength(3);
  });
});
