/**
 * RequirementsEntityService + RequirementsQueryService 단위 테스트
 * 대상: app/features/requests/service/entity.ts, query.ts
 *
 * - Entity: CRUD (create/update/delete), saveReview, saveHumanVerdict, logEvent, workPlan
 * - Query: listWithReviews, getById, getReview, getEvents, getWorkPlans, countByStatus, listByStatuses
 */

import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "tests/helpers/db";
import type { DB } from "~/db";
import { RequirementsEntityService } from "~/features/requests/service/entity";
import { RequirementsQueryService } from "~/features/requests/service/query";
import { featureRequests, requestReviews, requestEvents, workPlans } from "~/features/requests/db/schema";
import { users, tenants, tenantMembers } from "~/db/schema";
import { RequestClassification, RequestEventType } from "~/features/requests/constants";

let db: ReturnType<typeof createTestDb>;
let entity: RequirementsEntityService;
let query: RequirementsQueryService;

const TENANT_ID = "t-req-eq";
const USER_A = "user-req-eq-a";
const USER_B = "user-req-eq-b";

beforeAll(() => {
  db = createTestDb();
  entity = new RequirementsEntityService(db as unknown as DB);
  query = new RequirementsQueryService(db as unknown as DB);

  db.insert(users)
    .values([
      { id: USER_A, email: "a@eq.test", name: "작성자 A", role: "admin" },
      { id: USER_B, email: "b@eq.test", name: "리뷰어 B", role: "gatekeeper" },
    ])
    .run();

  db.insert(tenants)
    .values({ id: TENANT_ID, name: "EQ Tenant", slug: "eq-test", ownerUserId: USER_A })
    .run();

  db.insert(tenantMembers)
    .values([
      { id: "tm-eq-a", tenantId: TENANT_ID, userId: USER_A },
      { id: "tm-eq-b", tenantId: TENANT_ID, userId: USER_B },
    ])
    .run();
});

// ─── EntityService: CRUD ──────────────────────

describe("RequirementsEntityService", () => {
  describe("createRequest", () => {
    it("요구사항 생성 + 기본값", async () => {
      const created = await entity.createRequest({
        title: "테스트 요구사항",
        description: "설명입니다",
        priority: "high",
        submitterId: USER_A,
      });
      expect(created.id).toBeTruthy();
      expect(created.title).toBe("테스트 요구사항");
      expect(created.status).toBe("OPEN");
      expect(created.priority).toBe("high");
    });
  });

  describe("updateRequest", () => {
    it("상태 및 리뷰어 업데이트", async () => {
      const created = await entity.createRequest({
        title: "업데이트 대상",
        description: "설명",
        priority: "medium",
        submitterId: USER_A,
      });

      await entity.updateRequest(created.id, {
        status: "AI_REVIEWING",
        reviewerId: USER_B,
      });

      const [updated] = db.select().from(featureRequests).where(eq(featureRequests.id, created.id)).all();
      expect(updated.status).toBe("AI_REVIEWING");
      expect(updated.reviewerId).toBe(USER_B);
    });
  });

  describe("deleteRequest", () => {
    it("요구사항 삭제", async () => {
      const created = await entity.createRequest({
        title: "삭제 대상",
        description: "설명",
        priority: "low",
        submitterId: USER_A,
      });

      await entity.deleteRequest(created.id);

      const rows = db.select().from(featureRequests).where(eq(featureRequests.id, created.id)).all();
      expect(rows).toHaveLength(0);
    });
  });

  describe("saveReview", () => {
    it("AI 리뷰 저장", async () => {
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
        rationale: "가치 있는 기능입니다",
        matchedRoutes: ["/api/test"],
        matchedSpecSections: ["스펙 섹션 A"],
        workPlanDraft: "## 작업계획\n1. 구현\n2. 테스트",
        modelId: "claude-sonnet-4-20250514",
        tokenUsage: 1200,
      });

      expect(review.id).toBeTruthy();
      expect(review.classification).toBe("NEW_VALUABLE");
      expect(review.impactScore).toBe(4);
      expect(review.workPlanDraft).toContain("작업계획");
      expect(review.tokenUsage).toBe(1200);
    });
  });

  describe("saveHumanVerdict", () => {
    it("HITL 판정 저장", async () => {
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
        comment: "승인합니다",
        reviewerId: USER_B,
      });

      const [updated] = db.select().from(requestReviews).where(eq(requestReviews.id, review.id)).all();
      expect(updated.humanVerdict).toBe("APPROVED");
      expect(updated.humanComment).toBe("승인합니다");
      expect(updated.reviewedBy).toBe(USER_B);
      expect(updated.reviewedAt).toBeTruthy();
    });
  });

  describe("logEvent", () => {
    it("이벤트 로그 기록", async () => {
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
        payload: { source: "test" },
      });

      const events = db.select().from(requestEvents).where(eq(requestEvents.requestId, req.id)).all();
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe("created");
      expect(events[0].actorId).toBe(USER_A);
    });
  });

  describe("createWorkPlan / updateWorkPlan", () => {
    it("작업계획 생성 + 상태 업데이트", async () => {
      const req = await entity.createRequest({
        title: "작업계획 테스트",
        description: "설명",
        priority: "high",
        submitterId: USER_A,
      });

      const plan = await entity.createWorkPlan({
        requestId: req.id,
        title: "구현 계획",
        description: "UI + API 구현",
        steps: ["1. UI", "2. API", "3. 테스트"],
        estimatedEffort: "3일",
        createdBy: USER_B,
      });

      expect(plan.id).toBeTruthy();
      expect(plan.title).toBe("구현 계획");
      expect(plan.status).toBe("DRAFT");
      expect(plan.steps).toEqual(["1. UI", "2. API", "3. 테스트"]);

      // 상태 업데이트
      await entity.updateWorkPlan(plan.id, { status: "APPROVED" });
      const [updated] = db.select().from(workPlans).where(eq(workPlans.id, plan.id)).all();
      expect(updated.status).toBe("APPROVED");
    });
  });
});

// ─── QueryService ─────────────────────────────

describe("RequirementsQueryService", () => {
  // 시드 데이터
  let seedReqId: string;
  let seedReviewId: string;

  beforeAll(async () => {
    // 쿼리 테스트용 시드 데이터
    const created = await entity.createRequest({
      title: "쿼리 테스트 요구사항",
      description: "쿼리 테스트 설명",
      priority: "high",
      submitterId: USER_A,
    });
    seedReqId = created.id;

    const review = await entity.saveReview({
      requestId: seedReqId,
      classification: RequestClassification.NEW_VALUABLE,
      impactScore: 5,
      feasibilityScore: 4,
      rationale: "쿼리 테스트 근거",
    });
    seedReviewId = review.id;

    await entity.updateRequest(seedReqId, { aiReviewId: seedReviewId });

    await entity.logEvent({
      requestId: seedReqId,
      eventType: RequestEventType.CREATED,
      actorId: USER_A,
      actorType: "user",
    });

    await entity.createWorkPlan({
      requestId: seedReqId,
      title: "테스트 작업계획",
      description: "설명",
      createdBy: USER_A,
    });
  });

  describe("listWithReviews", () => {
    it("리뷰 포함 목록 반환", async () => {
      const list = await query.listWithReviews();
      expect(list.length).toBeGreaterThanOrEqual(1);

      const found = list.find((r) => r.id === seedReqId);
      expect(found).toBeTruthy();
      expect(found!.review).toBeTruthy();
      expect(found!.review!.classification).toBe("NEW_VALUABLE");
      expect(found!.submitterName).toBe("작성자 A");
    });
  });

  describe("getById", () => {
    it("리뷰 포함 상세 반환", async () => {
      const result = await query.getById(seedReqId);
      expect(result).toBeTruthy();
      expect(result!.request.id).toBe(seedReqId);
      expect(result!.review).toBeTruthy();
      expect(result!.review!.classification).toBe("NEW_VALUABLE");
    });

    it("존재하지 않으면 null", async () => {
      const result = await query.getById("non-existent-id");
      expect(result).toBeNull();
    });
  });

  describe("getReview", () => {
    it("리뷰 상세 반환", async () => {
      const review = await query.getReview(seedReviewId);
      expect(review).toBeTruthy();
      expect(review!.rationale).toBe("쿼리 테스트 근거");
    });

    it("존재하지 않으면 null", async () => {
      const result = await query.getReview("non-existent");
      expect(result).toBeNull();
    });
  });

  describe("getEvents", () => {
    it("이벤트 타임라인 반환", async () => {
      const events = await query.getEvents(seedReqId);
      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events[0].eventType).toBe("created");
    });
  });

  describe("getWorkPlans", () => {
    it("작업계획 목록 반환", async () => {
      const plans = await query.getWorkPlans(seedReqId);
      expect(plans.length).toBeGreaterThanOrEqual(1);
      expect(plans[0].title).toBe("테스트 작업계획");
    });
  });

  describe("countByStatus", () => {
    it("상태별 카운트", async () => {
      const counts = await query.countByStatus();
      expect(counts.OPEN).toBeGreaterThanOrEqual(1);
    });
  });

  describe("listByStatuses", () => {
    it("상태 필터 조회", async () => {
      const rows = await query.listByStatuses(["OPEN"]);
      expect(rows.length).toBeGreaterThanOrEqual(1);
      for (const r of rows) {
        expect(r.status).toBe("OPEN");
      }
    });

    it("빈 배열 → 빈 결과", async () => {
      const rows = await query.listByStatuses([]);
      expect(rows).toHaveLength(0);
    });
  });
});
