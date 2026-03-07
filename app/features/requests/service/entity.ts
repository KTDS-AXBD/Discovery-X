/**
 * RequirementsEntityService — CRUD
 * Bounded Context: requests
 */

import { eq, sql, desc } from "drizzle-orm";
import type { DB } from "~/db";
import { alerts } from "~/db";
import { featureRequests, requestReviews, requestEvents, workPlans, workPlanRuns } from "../db/schema";
import type { WorkPlanStepData } from "../db/schema";

export class RequirementsEntityService {
  constructor(private db: DB) {}

  /** 요구사항 생성 */
  async createRequest(input: {
    title: string;
    description: string;
    priority: string;
    submitterId: string;
  }) {
    const [created] = await this.db
      .insert(featureRequests)
      .values({
        title: input.title,
        description: input.description,
        priority: input.priority,
        submitterId: input.submitterId,
      })
      .returning();
    return created;
  }

  /** 요구사항 업데이트 */
  async updateRequest(id: string, updates: Partial<{
    status: string;
    reason: string;
    reviewerId: string;
    reviewedAt: Date;
    aiReviewId: string;
    linkedDiscoveryId: string;
    reqCode: string;
    type: string;
    domain: string;
    impactLevel: string;
    urgencyLevel: string;
    specItemId: string;
    milestoneVersion: string;
  }>) {
    await this.db
      .update(featureRequests)
      .set(updates)
      .where(eq(featureRequests.id, id));
  }

  /** DX-REQ-{NNN} 코드 자동 생성 */
  async generateReqCode(): Promise<string> {
    const [row] = await this.db
      .select({ reqCode: featureRequests.reqCode })
      .from(featureRequests)
      .where(sql`${featureRequests.reqCode} IS NOT NULL`)
      .orderBy(desc(featureRequests.reqCode))
      .limit(1);

    let nextNum = 1;
    if (row?.reqCode) {
      const match = row.reqCode.match(/DX-REQ-(\d+)/);
      if (match) nextNum = parseInt(match[1], 10) + 1;
    }

    return `DX-REQ-${String(nextNum).padStart(3, "0")}`;
  }

  /** 요구사항 삭제 */
  async deleteRequest(id: string) {
    await this.db.delete(featureRequests).where(eq(featureRequests.id, id));
  }

  /** 상태 변경 + 알림 생성 */
  async changeStatus(id: string, input: {
    status: string;
    reviewerId: string;
    reason?: string;
    existingTitle?: string;
    existingSubmitterId?: string;
    existingLinkedDiscoveryId?: string | null;
  }) {
    const updates: Record<string, unknown> = {
      status: input.status,
      reviewerId: input.reviewerId,
      reviewedAt: new Date(),
    };
    if (input.reason) updates.reason = input.reason;

    await this.db
      .update(featureRequests)
      .set(updates)
      .where(eq(featureRequests.id, id));

    if (input.existingSubmitterId && input.existingSubmitterId !== input.reviewerId) {
      await this.db.insert(alerts).values({
        id: crypto.randomUUID(),
        severity: "info",
        message: `요구사항 "${input.existingTitle}"의 상태가 ${input.status}(으)로 변경되었습니다.`,
        discoveryId: input.existingLinkedDiscoveryId,
      });
    }
  }

  /** AI 리뷰 저장 */
  async saveReview(input: {
    requestId: string;
    classification: string;
    impactScore: number;
    feasibilityScore: number;
    rationale: string;
    matchedRoutes?: string[];
    matchedSpecSections?: string[];
    workPlanDraft?: string;
    modelId?: string;
    tokenUsage?: number;
  }) {
    const [review] = await this.db
      .insert(requestReviews)
      .values({
        requestId: input.requestId,
        classification: input.classification,
        impactScore: input.impactScore,
        feasibilityScore: input.feasibilityScore,
        rationale: input.rationale,
        matchedRoutes: input.matchedRoutes ?? null,
        matchedSpecSections: input.matchedSpecSections ?? null,
        workPlanDraft: input.workPlanDraft ?? null,
        modelId: input.modelId ?? null,
        tokenUsage: input.tokenUsage ?? 0,
      })
      .returning();
    return review;
  }

  /** 리뷰에 HITL 판정 저장 */
  async saveHumanVerdict(reviewId: string, input: {
    verdict: string;
    comment?: string;
    reviewerId: string;
  }) {
    await this.db
      .update(requestReviews)
      .set({
        humanVerdict: input.verdict,
        humanComment: input.comment ?? null,
        reviewedBy: input.reviewerId,
        reviewedAt: new Date(),
      })
      .where(eq(requestReviews.id, reviewId));
  }

  /** 이벤트 기록 */
  async logEvent(input: {
    requestId: string;
    eventType: string;
    actorId?: string;
    actorType?: "user" | "agent" | "system";
    payload?: Record<string, unknown>;
  }) {
    await this.db.insert(requestEvents).values({
      requestId: input.requestId,
      eventType: input.eventType,
      actorId: input.actorId ?? null,
      actorType: input.actorType ?? "system",
      payload: input.payload ?? null,
    });
  }

  /** 작업계획 생성 (구조화된 steps 지원) */
  async createWorkPlan(input: {
    requestId: string;
    reviewId?: string;
    title: string;
    description: string;
    steps?: WorkPlanStepData[] | string[];
    estimatedEffort?: string;
    createdBy?: string;
  }) {
    // string[] → WorkPlanStepData[] 변환 (레거시 호환)
    let structuredSteps: WorkPlanStepData[] | null = null;
    if (input.steps && input.steps.length > 0) {
      if (typeof input.steps[0] === "string") {
        structuredSteps = (input.steps as string[]).map((title, i) => ({
          id: `step-${i}`,
          title,
          status: "todo" as const,
        }));
      } else {
        structuredSteps = input.steps as WorkPlanStepData[];
      }
    }

    const [plan] = await this.db
      .insert(workPlans)
      .values({
        requestId: input.requestId,
        reviewId: input.reviewId ?? null,
        title: input.title,
        description: input.description,
        steps: structuredSteps,
        estimatedEffort: input.estimatedEffort ?? null,
        createdBy: input.createdBy ?? null,
      })
      .returning();
    return plan;
  }

  /** 작업계획 업데이트 */
  async updateWorkPlan(id: string, updates: Partial<{
    status: string;
    progress: number;
    steps: WorkPlanStepData[];
    linkedDiscoveryId: string;
    startedAt: Date;
    completedAt: Date;
    updatedAt: Date;
  }>) {
    await this.db
      .update(workPlans)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(workPlans.id, id));
  }

  /** 작업계획 단계 상태 변경 */
  async updateStepStatus(planId: string, stepIndex: number, status: WorkPlanStepData["status"]) {
    const [plan] = await this.db.select().from(workPlans).where(eq(workPlans.id, planId));
    if (!plan || !plan.steps) throw new Error("작업계획 또는 단계를 찾을 수 없어요.");

    const steps = plan.steps as WorkPlanStepData[];
    if (stepIndex < 0 || stepIndex >= steps.length) throw new Error("유효하지 않은 단계 인덱스예요.");

    const now = Math.floor(Date.now() / 1000);
    steps[stepIndex].status = status;

    if (status === "doing" && !steps[stepIndex].startedAt) {
      steps[stepIndex].startedAt = now;
    }
    if (status === "done" && !steps[stepIndex].completedAt) {
      steps[stepIndex].completedAt = now;
    }

    // 진행률 계산
    const doneCount = steps.filter((s) => s.status === "done").length;
    const progress = Math.round((doneCount / steps.length) * 100);

    // 전체 상태 자동 업데이트
    const allDone = steps.every((s) => s.status === "done");
    const anyDoing = steps.some((s) => s.status === "doing");

    const planUpdates: Record<string, unknown> = {
      steps,
      progress,
      updatedAt: new Date(),
    };

    if (allDone) {
      planUpdates.status = "COMPLETED";
      planUpdates.completedAt = new Date();
    } else if (anyDoing || doneCount > 0) {
      planUpdates.status = "IN_PROGRESS";
      if (!plan.startedAt) planUpdates.startedAt = new Date();
    }

    await this.db.update(workPlans).set(planUpdates).where(eq(workPlans.id, planId));

    return { steps, progress };
  }

  /** Agent 실행 기록 생성 */
  async createRun(input: {
    workPlanId: string;
    stepIndex: number;
    agentInput?: string;
  }) {
    const [run] = await this.db
      .insert(workPlanRuns)
      .values({
        workPlanId: input.workPlanId,
        stepIndex: input.stepIndex,
        status: "pending",
        agentInput: input.agentInput ?? null,
      })
      .returning();
    return run;
  }

  /** Agent 실행 상태 업데이트 */
  async updateRun(id: string, updates: Partial<{
    status: string;
    agentOutput: string;
    modelId: string;
    tokenUsage: number;
    errorMessage: string;
    completedAt: Date;
  }>) {
    await this.db
      .update(workPlanRuns)
      .set(updates)
      .where(eq(workPlanRuns.id, id));
  }
}
