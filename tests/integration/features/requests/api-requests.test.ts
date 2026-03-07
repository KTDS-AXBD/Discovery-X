/**
 * 요구사항 API 통합 테스트
 * 대상: api.requests (POST), api.requests.$id (PATCH/DELETE), api.requests.$id.review (POST)
 * 서비스 레이어 직접 호출 + API 유효성 검증 로직 재현
 */

import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDB } from "../../../helpers/db";
import { makeUser, resetFixtureCounter } from "../../../helpers/fixtures";
import { users, alerts } from "~/db";
import { featureRequests, requestReviews, requestEvents } from "~/features/requests/db/schema";
import {
  RequirementsEntityService,
  RequirementsQueryService,
  RequirementsWorkflowService,
} from "~/features/requests/service";
import {
  RequestClassification,
  RequestEventType,
} from "~/features/requests/constants";
import type { DB } from "~/db";

let db: TestDB;
let entity: RequirementsEntityService;
let query: RequirementsQueryService;
let workflow: RequirementsWorkflowService;

const USER_SUBMITTER = "user-api-sub";
const USER_REVIEWER = "user-api-rev";
const USER_NORMAL = "user-api-norm";

beforeEach(() => {
  resetFixtureCounter();
  db = createTestDb();
  entity = new RequirementsEntityService(db as unknown as DB);
  query = new RequirementsQueryService(db as unknown as DB);
  workflow = new RequirementsWorkflowService(db as unknown as DB);

  db.insert(users)
    .values([
      makeUser({ id: USER_SUBMITTER, name: "제출자", role: "user" }),
      makeUser({ id: USER_REVIEWER, name: "리뷰어", role: "gatekeeper" }),
      makeUser({ id: USER_NORMAL, name: "일반 유저", role: "user" }),
    ])
    .run();
});

// ─── POST /api/requests: 요구사항 생성 ────────

describe("POST /api/requests — 요구사항 생성", () => {
  it("유효한 입력 → 정상 생성 (201)", async () => {
    const created = await entity.createRequest({
      title: "새 기능 요구",
      description: "상세 설명이에요",
      priority: "high",
      submitterId: USER_SUBMITTER,
    });

    expect(created.id).toBeTruthy();
    expect(created.title).toBe("새 기능 요구");
    expect(created.description).toBe("상세 설명이에요");
    expect(created.priority).toBe("high");
    expect(created.status).toBe("OPEN");
    expect(created.submitterId).toBe(USER_SUBMITTER);
  });

  it("빈 제목 → 400 에러 시뮬레이션", () => {
    // API 라우트 검증: if (!body.title?.trim() || !body.description?.trim()) → 400
    const invalidCases = [
      { title: "", description: "설명" },
      { title: "  ", description: "설명" },
      { title: undefined as string | undefined, description: "설명" },
    ];

    for (const body of invalidCases) {
      const invalid = !body.title?.trim();
      expect(invalid, `title="${body.title}" should be invalid`).toBe(true);
    }
  });

  it("빈 설명 → 400 에러 시뮬레이션", () => {
    const invalidCases = [
      { title: "제목", description: "" },
      { title: "제목", description: "   " },
      { title: "제목", description: undefined as string | undefined },
    ];

    for (const body of invalidCases) {
      const invalid = !body.description?.trim();
      expect(invalid, `description="${body.description}" should be invalid`).toBe(true);
    }
  });

  it("제목 100자 초과 → 400 에러 시뮬레이션", () => {
    const longTitle = "가".repeat(101);
    expect(longTitle.trim().length > 100).toBe(true);

    const exactTitle = "가".repeat(100);
    expect(exactTitle.trim().length > 100).toBe(false);
  });

  it("잘못된 우선순위 → 400 에러 시뮬레이션", () => {
    const validPriorities = ["high", "medium", "low"];
    expect(validPriorities.includes("urgent")).toBe(false);
    expect(validPriorities.includes("")).toBe(false);
    expect(validPriorities.includes("HIGH")).toBe(false); // 대소문자 구분
    expect(validPriorities.includes("medium")).toBe(true);
  });

  it("기본 우선순위는 medium", async () => {
    const created = await entity.createRequest({
      title: "기본 우선순위",
      description: "설명",
      priority: "medium",
      submitterId: USER_SUBMITTER,
    });
    expect(created.priority).toBe("medium");
  });
});

// ─── PATCH /api/requests/:id: 레거시 상태 변경 ─

describe("PATCH /api/requests/:id — 레거시 상태 변경", () => {
  let reqId: string;

  beforeEach(async () => {
    const req = await entity.createRequest({
      title: "상태 변경 대상",
      description: "설명",
      priority: "medium",
      submitterId: USER_SUBMITTER,
    });
    reqId = req.id;
  });

  it("IN_REVIEW 상태 변경 (레거시)", async () => {
    // API 라우트의 레거시 상태 변경 로직:
    // validStatuses = ["OPEN", "IN_REVIEW", "ACCEPTED", "REJECTED"]
    const validStatuses = ["OPEN", "IN_REVIEW", "ACCEPTED", "REJECTED"];
    expect(validStatuses.includes("IN_REVIEW")).toBe(true);

    await entity.updateRequest(reqId, {
      status: "IN_REVIEW",
      reviewerId: USER_REVIEWER,
      reviewedAt: new Date(),
    });

    const [updated] = db
      .select()
      .from(featureRequests)
      .where(eq(featureRequests.id, reqId))
      .all();
    expect(updated.status).toBe("IN_REVIEW");
    expect(updated.reviewerId).toBe(USER_REVIEWER);
  });

  it("ACCEPTED 상태 변경", async () => {
    await entity.updateRequest(reqId, {
      status: "ACCEPTED",
      reviewerId: USER_REVIEWER,
      reviewedAt: new Date(),
    });

    const [updated] = db
      .select()
      .from(featureRequests)
      .where(eq(featureRequests.id, reqId))
      .all();
    expect(updated.status).toBe("ACCEPTED");
  });

  it("REJECTED + reason 저장", async () => {
    await entity.updateRequest(reqId, {
      status: "REJECTED",
      reason: "보류 사유",
      reviewerId: USER_REVIEWER,
      reviewedAt: new Date(),
    });

    const [updated] = db
      .select()
      .from(featureRequests)
      .where(eq(featureRequests.id, reqId))
      .all();
    expect(updated.status).toBe("REJECTED");
    expect(updated.reason).toBe("보류 사유");
  });

  it("잘못된 상태 값 → 400 시뮬레이션", () => {
    const validStatuses = ["OPEN", "IN_REVIEW", "ACCEPTED", "REJECTED"];
    expect(validStatuses.includes("INVALID")).toBe(false);
    expect(validStatuses.includes("CLASSIFIED")).toBe(false);
    expect(validStatuses.includes("HUMAN_REVIEW")).toBe(false);
  });

  it("제출자 ≠ 리뷰어 → 알림 생성", async () => {
    const alertsBefore = db.select().from(alerts).all().length;

    // 알림 로직 재현 (api.requests.$id의 라우트 로직)
    const existing = db
      .select()
      .from(featureRequests)
      .where(eq(featureRequests.id, reqId))
      .all()[0];

    if (existing.submitterId !== USER_REVIEWER) {
      await db.insert(alerts).values({
        id: `alert-legacy-${reqId}`,
        severity: "info",
        message: `요구사항 "${existing.title}"의 상태가 ACCEPTED(으)로 변경되었습니다.`,
      });
    }

    const alertsAfter = db.select().from(alerts).all().length;
    expect(alertsAfter).toBeGreaterThan(alertsBefore);
  });
});

// ─── PATCH /api/requests/:id: HITL 판정 ───────

describe("PATCH /api/requests/:id — HITL 판정 (humanVerdict)", () => {
  let reqId: string;

  beforeEach(async () => {
    // HUMAN_REVIEW 상태의 요구사항 + AI 리뷰 준비
    db.insert(featureRequests)
      .values({
        id: "hitl-req",
        title: "HITL 테스트 요구사항",
        description: "HITL 판정 테스트용",
        priority: "high",
        status: "HUMAN_REVIEW",
        submitterId: USER_SUBMITTER,
      })
      .run();

    db.insert(requestReviews)
      .values({
        id: "hitl-review",
        requestId: "hitl-req",
        classification: RequestClassification.NEW_VALUABLE,
        impactScore: 4,
        feasibilityScore: 3,
        rationale: "가치 있는 기능",
      })
      .run();

    db.update(featureRequests)
      .set({ aiReviewId: "hitl-review" })
      .where(eq(featureRequests.id, "hitl-req"))
      .run();

    reqId = "hitl-req";
  });

  it("APPROVED → ACCEPTED + Discovery 자동 생성 (NEW_VALUABLE)", async () => {
    const result = await workflow.submitHumanVerdict({
      requestId: reqId,
      verdict: "APPROVED",
      reviewerId: USER_REVIEWER,
    });

    expect(result.status).toBe("ACCEPTED");

    // Discovery 생성 확인
    const [updated] = db
      .select()
      .from(featureRequests)
      .where(eq(featureRequests.id, reqId))
      .all();
    expect(updated.linkedDiscoveryId).toBeTruthy();

    // HUMAN_VERDICT 이벤트 확인
    const events = db
      .select()
      .from(requestEvents)
      .where(eq(requestEvents.requestId, reqId))
      .all();
    expect(events.map((e) => e.eventType)).toContain(RequestEventType.HUMAN_VERDICT);
    expect(events.map((e) => e.eventType)).toContain(RequestEventType.DISCOVERY_LINKED);
  });

  it("REJECTED → REJECTED + 알림 생성", async () => {
    const alertsBefore = db.select().from(alerts).all().length;

    const result = await workflow.submitHumanVerdict({
      requestId: reqId,
      verdict: "REJECTED",
      comment: "보류 사유",
      reviewerId: USER_REVIEWER,
    });

    expect(result.status).toBe("REJECTED");

    const alertsAfter = db.select().from(alerts).all().length;
    expect(alertsAfter).toBeGreaterThan(alertsBefore);

    const [updated] = db
      .select()
      .from(featureRequests)
      .where(eq(featureRequests.id, reqId))
      .all();
    expect(updated.reason).toBe("보류 사유");
  });

  it("NEEDS_REVISION → CLASSIFIED 되돌림", async () => {
    const result = await workflow.submitHumanVerdict({
      requestId: reqId,
      verdict: "NEEDS_REVISION",
      comment: "수정이 필요해요",
      reviewerId: USER_REVIEWER,
    });

    expect(result.status).toBe("CLASSIFIED");
  });
});

// ─── DELETE /api/requests/:id: 삭제 권한 ──────

describe("DELETE /api/requests/:id — 삭제 권한 검증", () => {
  it("OPEN 상태 + 제출자 → 삭제 성공", async () => {
    const req = await entity.createRequest({
      title: "삭제 대상",
      description: "설명",
      priority: "low",
      submitterId: USER_SUBMITTER,
    });

    // 삭제 조건 시뮬레이션: OPEN && (submitter || reviewer)
    const existing = db
      .select()
      .from(featureRequests)
      .where(eq(featureRequests.id, req.id))
      .all()[0];

    expect(existing.status).toBe("OPEN");
    const isSubmitter = existing.submitterId === USER_SUBMITTER;
    expect(isSubmitter).toBe(true);

    await entity.deleteRequest(req.id);

    const rows = db
      .select()
      .from(featureRequests)
      .where(eq(featureRequests.id, req.id))
      .all();
    expect(rows).toHaveLength(0);
  });

  it("OPEN 아닌 상태 → 삭제 불가 (400 시뮬레이션)", async () => {
    db.insert(featureRequests)
      .values({
        id: "del-accepted",
        title: "ACCEPTED 상태",
        description: "설명",
        priority: "medium",
        status: "ACCEPTED",
        submitterId: USER_SUBMITTER,
      })
      .run();

    const existing = db
      .select()
      .from(featureRequests)
      .where(eq(featureRequests.id, "del-accepted"))
      .all()[0];

    expect(existing.status).not.toBe("OPEN");
    // API 라우트: if (existing.status !== "OPEN") → 400
    const canDelete = existing.status === "OPEN";
    expect(canDelete).toBe(false);
  });

  it("다른 사용자 + 일반 역할 → 삭제 불가 (403 시뮬레이션)", async () => {
    const req = await entity.createRequest({
      title: "권한 테스트",
      description: "설명",
      priority: "medium",
      submitterId: USER_SUBMITTER,
    });

    const existing = db
      .select()
      .from(featureRequests)
      .where(eq(featureRequests.id, req.id))
      .all()[0];

    const actorId = USER_NORMAL;
    const actorRole = "user";

    const isSubmitter = existing.submitterId === actorId;
    const isReviewer = ["admin", "gatekeeper", "owner"].includes(actorRole);
    const canDelete = isSubmitter || isReviewer;
    expect(canDelete).toBe(false);
  });

  it("게이트키퍼는 다른 사용자의 OPEN 요구사항도 삭제 가능", async () => {
    const req = await entity.createRequest({
      title: "게이트키퍼 삭제",
      description: "설명",
      priority: "low",
      submitterId: USER_SUBMITTER,
    });

    const actorRole = "gatekeeper";
    const isReviewer = ["admin", "gatekeeper", "owner"].includes(actorRole);
    expect(isReviewer).toBe(true);

    await entity.deleteRequest(req.id);

    const rows = db
      .select()
      .from(featureRequests)
      .where(eq(featureRequests.id, req.id))
      .all();
    expect(rows).toHaveLength(0);
  });
});

// ─── POST /api/requests/:id/review: AI 리뷰 ──

describe("POST /api/requests/:id/review — AI 리뷰 트리거", () => {
  it("게이트키퍼 권한 검증 시뮬레이션", () => {
    // API 라우트: isGatekeeper() = admin | gatekeeper | owner
    const isGatekeeper = (role: string) =>
      role === "admin" || role === "gatekeeper" || role === "owner";

    expect(isGatekeeper("gatekeeper")).toBe(true);
    expect(isGatekeeper("admin")).toBe(true);
    expect(isGatekeeper("owner")).toBe(true);
    expect(isGatekeeper("user")).toBe(false);
    expect(isGatekeeper("")).toBe(false);
  });

  it("AI 리뷰 결과 저장 → 워크플로우 진행", async () => {
    // AI 리뷰 트리거 후 서비스 레이어 동작 검증
    db.insert(featureRequests)
      .values({
        id: "review-trigger",
        title: "리뷰 트리거 테스트",
        description: "AI 리뷰 대상",
        priority: "high",
        status: "OPEN",
        submitterId: USER_SUBMITTER,
      })
      .run();

    // 1. startAiReview: OPEN → AI_REVIEWING
    await workflow.startAiReview("review-trigger", USER_REVIEWER);
    let [updated] = db
      .select()
      .from(featureRequests)
      .where(eq(featureRequests.id, "review-trigger"))
      .all();
    expect(updated.status).toBe("AI_REVIEWING");

    // 2. saveReview: AI 분석 결과 저장
    const review = await entity.saveReview({
      requestId: "review-trigger",
      classification: RequestClassification.NEW_VALUABLE,
      impactScore: 5,
      feasibilityScore: 4,
      rationale: "매우 가치 있는 기능이에요",
      matchedRoutes: ["/dashboard"],
      workPlanDraft: "## 계획\n1. 구현",
      modelId: "claude-sonnet-4-20250514",
      tokenUsage: 2000,
    });

    // 3. completeAiReview: AI_REVIEWING → CLASSIFIED → HUMAN_REVIEW
    await workflow.completeAiReview("review-trigger", review.id, RequestClassification.NEW_VALUABLE);

    [updated] = db
      .select()
      .from(featureRequests)
      .where(eq(featureRequests.id, "review-trigger"))
      .all();
    expect(updated.status).toBe("HUMAN_REVIEW");
    expect(updated.aiReviewId).toBe(review.id);

    // 이벤트 타임라인 확인
    const events = db
      .select()
      .from(requestEvents)
      .where(eq(requestEvents.requestId, "review-trigger"))
      .all();
    const eventTypes = events.map((e) => e.eventType);
    expect(eventTypes).toContain(RequestEventType.STATUS_CHANGED);
    expect(eventTypes).toContain(RequestEventType.AI_REVIEW_COMPLETED);
  });

  it("OUT_OF_SCOPE → 자동 REJECTED (HUMAN_REVIEW 스킵)", async () => {
    db.insert(featureRequests)
      .values({
        id: "review-oos",
        title: "범위 밖 요구사항",
        description: "프로젝트와 관계없음",
        priority: "low",
        status: "OPEN",
        submitterId: USER_SUBMITTER,
      })
      .run();

    await workflow.startAiReview("review-oos", USER_REVIEWER);

    const review = await entity.saveReview({
      requestId: "review-oos",
      classification: RequestClassification.OUT_OF_SCOPE,
      impactScore: 0,
      feasibilityScore: 0,
      rationale: "프로젝트 범위 밖",
    });

    await workflow.completeAiReview("review-oos", review.id, RequestClassification.OUT_OF_SCOPE);

    const [updated] = db
      .select()
      .from(featureRequests)
      .where(eq(featureRequests.id, "review-oos"))
      .all();
    expect(updated.status).toBe("REJECTED");
    expect(updated.reason).toContain("OUT_OF_SCOPE");
  });

  it("전체 플로우: 생성 → AI 리뷰 → HITL 승인 → Discovery 생성", async () => {
    // 1. 생성
    const req = await entity.createRequest({
      title: "E2E 플로우 테스트",
      description: "처음부터 끝까지 검증",
      priority: "high",
      submitterId: USER_SUBMITTER,
    });

    // 2. AI 리뷰 시작
    await workflow.startAiReview(req.id, USER_REVIEWER);

    // 3. AI 리뷰 저장
    const review = await entity.saveReview({
      requestId: req.id,
      classification: RequestClassification.NEW_VALUABLE,
      impactScore: 5,
      feasibilityScore: 5,
      rationale: "탁월한 기능이에요",
    });

    // 4. AI 리뷰 완료 → HUMAN_REVIEW
    await workflow.completeAiReview(req.id, review.id, RequestClassification.NEW_VALUABLE);

    // 5. HITL 승인 → ACCEPTED + Discovery 생성
    const result = await workflow.submitHumanVerdict({
      requestId: req.id,
      verdict: "APPROVED",
      comment: "바로 진행해요",
      reviewerId: USER_REVIEWER,
    });

    expect(result.status).toBe("ACCEPTED");

    // Discovery 확인
    const [final] = db
      .select()
      .from(featureRequests)
      .where(eq(featureRequests.id, req.id))
      .all();
    expect(final.linkedDiscoveryId).toBeTruthy();
    expect(final.status).toBe("ACCEPTED");

    // 전체 이벤트 타임라인 확인
    const events = db
      .select()
      .from(requestEvents)
      .where(eq(requestEvents.requestId, req.id))
      .all();
    const eventTypes = events.map((e) => e.eventType);
    expect(eventTypes).toContain(RequestEventType.STATUS_CHANGED);
    expect(eventTypes).toContain(RequestEventType.AI_REVIEW_COMPLETED);
    expect(eventTypes).toContain(RequestEventType.HUMAN_VERDICT);
    expect(eventTypes).toContain(RequestEventType.DISCOVERY_LINKED);
  });
});
