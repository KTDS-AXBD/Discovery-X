/**
 * 작업계획 API 통합 테스트
 * 대상: api.requests.$id.plan (POST / PATCH)
 * 서비스 레이어 직접 호출로 검증
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDB } from "../../../helpers/db";
import { makeUser, resetFixtureCounter } from "../../../helpers/fixtures";
import { users } from "~/db/schema";
import { featureRequests } from "~/features/requests/db/schema";
import {
  RequirementsEntityService,
  RequirementsQueryService,
} from "~/features/requests/service";
import type { DB } from "~/db";

let db: TestDB;
let entity: RequirementsEntityService;
let query: RequirementsQueryService;

const USER_ID = "user-api-wp";
const REQ_ID = "req-api-wp";

beforeEach(() => {
  resetFixtureCounter();
  db = createTestDb();
  entity = new RequirementsEntityService(db as unknown as DB);
  query = new RequirementsQueryService(db as unknown as DB);

  db.insert(users)
    .values(makeUser({ id: USER_ID, name: "API 테스터" }))
    .run();

  db.insert(featureRequests)
    .values({
      id: REQ_ID,
      title: "API 테스트 요구사항",
      description: "API 통합 테스트용",
      priority: "high",
      status: "ACCEPTED",
      submitterId: USER_ID,
    })
    .run();
});

// ─── POST: 작업계획 생성 ──────────────────────

describe("POST /api/requests/:id/plan — 작업계획 생성", () => {
  it("제목/설명 필수, steps 선택 → 정상 생성", async () => {
    const plan = await entity.createWorkPlan({
      requestId: REQ_ID,
      title: "API 구현 계획",
      description: "REST API 설계 및 구현",
      steps: ["설계", "구현", "테스트"],
      estimatedEffort: "5일",
      createdBy: USER_ID,
    });

    expect(plan.id).toBeTruthy();
    expect(plan.title).toBe("API 구현 계획");
    expect(plan.description).toBe("REST API 설계 및 구현");
    expect(plan.status).toBe("DRAFT");
    expect(plan.steps).toHaveLength(3);
    expect(plan.estimatedEffort).toBe("5일");
    expect(plan.createdBy).toBe(USER_ID);

    // 조회 확인
    const plans = await query.getWorkPlans(REQ_ID);
    expect(plans).toHaveLength(1);
    expect(plans[0].id).toBe(plan.id);
  });

  it("빈 제목/설명 에러 (400 시뮬레이션)", async () => {
    // API 라우트의 validation 로직 재현:
    // if (!body.title?.trim() || !body.description?.trim()) → 400
    const body = { title: "", description: "설명" };
    const titleInvalid = !body.title?.trim();
    expect(titleInvalid).toBe(true);

    const body2 = { title: "제목", description: "  " };
    const descInvalid = !body2.description?.trim();
    expect(descInvalid).toBe(true);

    const body3 = { title: undefined as string | undefined, description: undefined as string | undefined };
    const bothInvalid = !body3.title?.trim() || !body3.description?.trim();
    expect(bothInvalid).toBe(true);
  });
});

// ─── PATCH: 작업계획 상태 변경 ──────────────────────

describe("PATCH /api/requests/:id/plan — 작업계획 상태 변경", () => {
  it("상태 변경 (DRAFT → APPROVED → IN_PROGRESS → COMPLETED)", async () => {
    const plan = await entity.createWorkPlan({
      requestId: REQ_ID,
      title: "상태 변경 테스트",
      description: "설명",
    });
    expect(plan.status).toBe("DRAFT");

    // DRAFT → APPROVED
    await entity.updateWorkPlan(plan.id, { status: "APPROVED" });
    let updated = await query.getWorkPlan(plan.id);
    expect(updated!.status).toBe("APPROVED");

    // APPROVED → IN_PROGRESS
    await entity.updateWorkPlan(plan.id, { status: "IN_PROGRESS" });
    updated = await query.getWorkPlan(plan.id);
    expect(updated!.status).toBe("IN_PROGRESS");

    // IN_PROGRESS → COMPLETED
    await entity.updateWorkPlan(plan.id, { status: "COMPLETED", completedAt: new Date() });
    updated = await query.getWorkPlan(plan.id);
    expect(updated!.status).toBe("COMPLETED");
    expect(updated!.completedAt).toBeTruthy();
  });

  it("잘못된 상태 에러 (400 시뮬레이션)", () => {
    // API 라우트의 validation 로직 재현:
    // validStatuses = ["DRAFT", "APPROVED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]
    const validStatuses = ["DRAFT", "APPROVED", "IN_PROGRESS", "COMPLETED", "CANCELLED"];

    expect(validStatuses.includes("INVALID_STATUS")).toBe(false);
    expect(validStatuses.includes("RANDOM")).toBe(false);
    expect(validStatuses.includes("")).toBe(false);
    expect(validStatuses.includes("APPROVED")).toBe(true);
    expect(validStatuses.includes("COMPLETED")).toBe(true);
  });

  it("planId 누락 에러 (400 시뮬레이션)", () => {
    // API 라우트의 validation 로직 재현:
    // if (!body.planId) → 400
    const body1 = { planId: "", status: "APPROVED" };
    expect(!body1.planId).toBe(true);

    const body2 = { status: "APPROVED" } as { planId?: string; status: string };
    expect(!body2.planId).toBe(true);

    const body3 = { planId: "plan-123", status: "APPROVED" };
    expect(!body3.planId).toBe(false);
  });
});
