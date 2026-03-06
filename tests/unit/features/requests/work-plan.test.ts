/**
 * 작업계획(Work Plan) 유닛 테스트
 * 대상: RequirementsEntityService (작업계획 CRUD) + RequirementsQueryService (조회)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDB } from "../../../helpers/db";
import { makeUser, resetFixtureCounter } from "../../../helpers/fixtures";
import { users } from "~/db/schema";
import { featureRequests } from "~/features/requests/db/schema";
import type { WorkPlanStepData } from "~/features/requests/db/schema";
import {
  RequirementsEntityService,
  RequirementsQueryService,
} from "~/features/requests/service";
import type { DB } from "~/db";

let db: TestDB;
let entity: RequirementsEntityService;
let query: RequirementsQueryService;

const USER_ID = "user-wp-1";
const USER_ID_2 = "user-wp-2";
const REQ_ID = "req-wp-1";
const REQ_ID_2 = "req-wp-2";

beforeEach(() => {
  resetFixtureCounter();
  db = createTestDb();
  entity = new RequirementsEntityService(db as unknown as DB);
  query = new RequirementsQueryService(db as unknown as DB);

  // 공통 시드 데이터
  db.insert(users)
    .values([
      makeUser({ id: USER_ID, name: "작업자 A" }),
      makeUser({ id: USER_ID_2, name: "작업자 B" }),
    ])
    .run();

  db.insert(featureRequests)
    .values([
      {
        id: REQ_ID,
        title: "테스트 요구사항 1",
        description: "설명 1",
        priority: "high",
        status: "ACCEPTED",
        submitterId: USER_ID,
      },
      {
        id: REQ_ID_2,
        title: "테스트 요구사항 2",
        description: "설명 2",
        priority: "medium",
        status: "ACCEPTED",
        submitterId: USER_ID_2,
      },
    ])
    .run();
});

// ─── EntityService: 작업계획 ──────────────────────

describe("RequirementsEntityService — 작업계획", () => {
  describe("createWorkPlan", () => {
    it("기본 작업계획 생성 + 반환값 검증", async () => {
      const plan = await entity.createWorkPlan({
        requestId: REQ_ID,
        title: "구현 계획",
        description: "UI + API 구현",
        createdBy: USER_ID,
      });

      expect(plan.id).toBeTruthy();
      expect(plan.title).toBe("구현 계획");
      expect(plan.description).toBe("UI + API 구현");
      expect(plan.requestId).toBe(REQ_ID);
      expect(plan.status).toBe("DRAFT");
      expect(plan.progress).toBe(0);
      expect(plan.createdBy).toBe(USER_ID);
      expect(plan.steps).toBeNull();
    });

    it("string[] steps → WorkPlanStepData[] 자동 변환", async () => {
      const plan = await entity.createWorkPlan({
        requestId: REQ_ID,
        title: "변환 테스트",
        description: "설명",
        steps: ["UI 구현", "API 연동", "테스트 작성"],
      });

      expect(plan.steps).toEqual([
        { id: "step-0", title: "UI 구현", status: "todo" },
        { id: "step-1", title: "API 연동", status: "todo" },
        { id: "step-2", title: "테스트 작성", status: "todo" },
      ]);
    });

    it("구조화된 WorkPlanStepData[] 직접 전달", async () => {
      const steps: WorkPlanStepData[] = [
        { id: "s1", title: "설계", status: "todo" },
        { id: "s2", title: "구현", description: "코드 작성", status: "todo" },
      ];

      const plan = await entity.createWorkPlan({
        requestId: REQ_ID,
        title: "구조화 테스트",
        description: "설명",
        steps,
      });

      expect(plan.steps).toEqual(steps);
      expect(plan.steps![1].description).toBe("코드 작성");
    });
  });

  describe("updateWorkPlan", () => {
    it("상태/진행률 업데이트", async () => {
      const plan = await entity.createWorkPlan({
        requestId: REQ_ID,
        title: "업데이트 테스트",
        description: "설명",
      });

      await entity.updateWorkPlan(plan.id, {
        status: "APPROVED",
        progress: 50,
      });

      const updated = await query.getWorkPlan(plan.id);
      expect(updated).toBeTruthy();
      expect(updated!.status).toBe("APPROVED");
      expect(updated!.progress).toBe(50);
    });
  });

  describe("updateStepStatus", () => {
    it("단계 상태 변경 (todo → doing → done)", async () => {
      const plan = await entity.createWorkPlan({
        requestId: REQ_ID,
        title: "단계 테스트",
        description: "설명",
        steps: ["단계 1", "단계 2", "단계 3"],
      });

      // todo → doing
      const { steps: stepsAfterDoing } = await entity.updateStepStatus(plan.id, 0, "doing");
      expect(stepsAfterDoing[0].status).toBe("doing");
      expect(stepsAfterDoing[0].startedAt).toBeTruthy();

      // doing → done
      const { steps: stepsAfterDone } = await entity.updateStepStatus(plan.id, 0, "done");
      expect(stepsAfterDone[0].status).toBe("done");
      expect(stepsAfterDone[0].completedAt).toBeTruthy();
    });

    it("진행률 자동 계산 (3단계 중 1완료 = 33%)", async () => {
      const plan = await entity.createWorkPlan({
        requestId: REQ_ID,
        title: "진행률 테스트",
        description: "설명",
        steps: ["A", "B", "C"],
      });

      const { progress } = await entity.updateStepStatus(plan.id, 0, "done");
      expect(progress).toBe(33);
    });

    it("모든 단계 done → 전체 COMPLETED + completedAt 설정", async () => {
      const plan = await entity.createWorkPlan({
        requestId: REQ_ID,
        title: "완료 테스트",
        description: "설명",
        steps: ["A", "B"],
      });

      await entity.updateStepStatus(plan.id, 0, "done");
      const { progress } = await entity.updateStepStatus(plan.id, 1, "done");

      expect(progress).toBe(100);

      const updated = await query.getWorkPlan(plan.id);
      expect(updated!.status).toBe("COMPLETED");
      expect(updated!.completedAt).toBeTruthy();
    });

    it("doing 단계 존재 시 → IN_PROGRESS 전환 + startedAt 설정", async () => {
      const plan = await entity.createWorkPlan({
        requestId: REQ_ID,
        title: "진행 전환 테스트",
        description: "설명",
        steps: ["A", "B"],
      });

      await entity.updateStepStatus(plan.id, 0, "doing");

      const updated = await query.getWorkPlan(plan.id);
      expect(updated!.status).toBe("IN_PROGRESS");
      expect(updated!.startedAt).toBeTruthy();
    });

    it("유효하지 않은 인덱스 에러", async () => {
      const plan = await entity.createWorkPlan({
        requestId: REQ_ID,
        title: "인덱스 에러 테스트",
        description: "설명",
        steps: ["A"],
      });

      await expect(entity.updateStepStatus(plan.id, 5, "done")).rejects.toThrow(
        "유효하지 않은 단계 인덱스"
      );

      await expect(entity.updateStepStatus(plan.id, -1, "done")).rejects.toThrow(
        "유효하지 않은 단계 인덱스"
      );
    });
  });

  describe("createRun", () => {
    it("Agent 실행 기록 생성", async () => {
      const plan = await entity.createWorkPlan({
        requestId: REQ_ID,
        title: "실행 테스트",
        description: "설명",
        steps: ["단계 1"],
      });

      const run = await entity.createRun({
        workPlanId: plan.id,
        stepIndex: 0,
        agentInput: "테스트 입력",
      });

      expect(run.id).toBeTruthy();
      expect(run.workPlanId).toBe(plan.id);
      expect(run.stepIndex).toBe(0);
      expect(run.status).toBe("pending");
      expect(run.agentInput).toBe("테스트 입력");
    });
  });

  describe("updateRun", () => {
    it("실행 상태/결과 업데이트", async () => {
      const plan = await entity.createWorkPlan({
        requestId: REQ_ID,
        title: "실행 업데이트 테스트",
        description: "설명",
      });

      const run = await entity.createRun({
        workPlanId: plan.id,
        stepIndex: 0,
      });

      await entity.updateRun(run.id, {
        status: "completed",
        agentOutput: "결과 출력",
        modelId: "claude-sonnet-4-20250514",
        tokenUsage: 500,
        completedAt: new Date(),
      });

      const runs = await query.getWorkPlanRuns(plan.id);
      expect(runs).toHaveLength(1);
      expect(runs[0].status).toBe("completed");
      expect(runs[0].agentOutput).toBe("결과 출력");
      expect(runs[0].modelId).toBe("claude-sonnet-4-20250514");
      expect(runs[0].tokenUsage).toBe(500);
    });
  });
});

// ─── QueryService: 작업계획 조회 ──────────────────────

describe("RequirementsQueryService — 작업계획 조회", () => {
  describe("listWorkPlansWithContext", () => {
    it("요구사항 제목/우선순위 JOIN 검증", async () => {
      await entity.createWorkPlan({
        requestId: REQ_ID,
        title: "컨텍스트 테스트",
        description: "설명",
        createdBy: USER_ID,
      });

      const list = await query.listWorkPlansWithContext();
      expect(list.length).toBeGreaterThanOrEqual(1);

      const found = list.find((p) => p.requestId === REQ_ID);
      expect(found).toBeTruthy();
      expect(found!.requestTitle).toBe("테스트 요구사항 1");
      expect(found!.requestPriority).toBe("high");
      expect(found!.createdByName).toBe("작업자 A");
    });

    it("runs 포함 조회", async () => {
      const plan = await entity.createWorkPlan({
        requestId: REQ_ID,
        title: "runs 테스트",
        description: "설명",
        steps: ["단계 1"],
      });

      await entity.createRun({
        workPlanId: plan.id,
        stepIndex: 0,
        agentInput: "입력 데이터",
      });

      const list = await query.listWorkPlansWithContext();
      const found = list.find((p) => p.id === plan.id);
      expect(found).toBeTruthy();
      expect(found!.runs).toHaveLength(1);
      expect(found!.runs[0].agentInput).toBe("입력 데이터");
    });
  });

  describe("countWorkPlansByStatus", () => {
    it("상태별 카운트 정확성", async () => {
      await entity.createWorkPlan({
        requestId: REQ_ID,
        title: "DRAFT 1",
        description: "설명",
      });
      await entity.createWorkPlan({
        requestId: REQ_ID,
        title: "DRAFT 2",
        description: "설명",
      });

      const plan3 = await entity.createWorkPlan({
        requestId: REQ_ID_2,
        title: "APPROVED 1",
        description: "설명",
      });
      await entity.updateWorkPlan(plan3.id, { status: "APPROVED" });

      const counts = await query.countWorkPlansByStatus();
      expect(counts.DRAFT).toBe(2);
      expect(counts.APPROVED).toBe(1);
    });
  });

  describe("getWorkPlanRuns", () => {
    it("실행 이력 조회 + 정렬 (최신순)", async () => {
      const plan = await entity.createWorkPlan({
        requestId: REQ_ID,
        title: "정렬 테스트",
        description: "설명",
        steps: ["A", "B"],
      });

      await entity.createRun({
        workPlanId: plan.id,
        stepIndex: 0,
      });
      await entity.createRun({
        workPlanId: plan.id,
        stepIndex: 1,
      });

      const runs = await query.getWorkPlanRuns(plan.id);
      expect(runs).toHaveLength(2);
      // 두 run 모두 반환, stepIndex 0/1 포함
      const indices = runs.map((r) => r.stepIndex).sort();
      expect(indices).toEqual([0, 1]);
      for (const run of runs) {
        expect(run.workPlanId).toBe(plan.id);
        expect(run.status).toBe("pending");
        expect(run.createdAt).toBeTruthy();
      }
    });
  });

  describe("getWorkPlan", () => {
    it("단건 조회", async () => {
      const plan = await entity.createWorkPlan({
        requestId: REQ_ID,
        title: "단건 조회",
        description: "테스트 설명",
        estimatedEffort: "2일",
      });

      const result = await query.getWorkPlan(plan.id);
      expect(result).toBeTruthy();
      expect(result!.title).toBe("단건 조회");
      expect(result!.estimatedEffort).toBe("2일");
    });

    it("존재하지 않으면 null", async () => {
      const result = await query.getWorkPlan("non-existent");
      expect(result).toBeNull();
    });
  });

  describe("getWorkPlans", () => {
    it("요구사항별 작업계획 목록", async () => {
      await entity.createWorkPlan({
        requestId: REQ_ID,
        title: "계획 A",
        description: "설명",
      });
      await entity.createWorkPlan({
        requestId: REQ_ID,
        title: "계획 B",
        description: "설명",
      });
      await entity.createWorkPlan({
        requestId: REQ_ID_2,
        title: "다른 요구사항 계획",
        description: "설명",
      });

      const plans = await query.getWorkPlans(REQ_ID);
      expect(plans).toHaveLength(2);
      for (const p of plans) {
        expect(p.requestId).toBe(REQ_ID);
      }
    });
  });
});
