/**
 * RequirementsQueryService — 읽기 전용 쿼리
 * Bounded Context: requests
 */

import { eq, desc, inArray } from "drizzle-orm";
import type { DB } from "~/db";
import { users } from "~/db";
import { featureRequests, requestReviews, requestEvents, workPlans, workPlanRuns } from "../db/schema";
import type { RequestWithReview, WorkPlanWithContext, WorkPlanRun } from "../types";
import type { RequestClassificationValue, HumanVerdictValue, PriorityLevelValue } from "../constants";
import { computePriorityLevel } from "../constants";

export class RequirementsQueryService {
  constructor(private db: DB) {}

  /** 전체 요구사항 목록 (리뷰 정보 포함) */
  async listWithReviews(): Promise<RequestWithReview[]> {
    const rows = await this.db
      .select({
        id: featureRequests.id,
        title: featureRequests.title,
        description: featureRequests.description,
        priority: featureRequests.priority,
        status: featureRequests.status,
        reason: featureRequests.reason,
        submitterId: featureRequests.submitterId,
        submitterName: users.name,
        createdAt: featureRequests.createdAt,
        reviewedAt: featureRequests.reviewedAt,
        aiReviewId: featureRequests.aiReviewId,
        linkedDiscoveryId: featureRequests.linkedDiscoveryId,
        // 표준체계 필드
        reqCode: featureRequests.reqCode,
        type: featureRequests.type,
        domain: featureRequests.domain,
        impactLevel: featureRequests.impactLevel,
        urgencyLevel: featureRequests.urgencyLevel,
        specItemId: featureRequests.specItemId,
        milestoneVersion: featureRequests.milestoneVersion,
        // 리뷰
        reviewClassification: requestReviews.classification,
        reviewImpactScore: requestReviews.impactScore,
        reviewFeasibilityScore: requestReviews.feasibilityScore,
        reviewRationale: requestReviews.rationale,
        reviewHumanVerdict: requestReviews.humanVerdict,
        reviewWorkPlanDraft: requestReviews.workPlanDraft,
      })
      .from(featureRequests)
      .leftJoin(users, eq(featureRequests.submitterId, users.id))
      .leftJoin(requestReviews, eq(featureRequests.aiReviewId, requestReviews.id))
      .orderBy(desc(featureRequests.createdAt));

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      priority: r.priority,
      status: r.status as RequestWithReview["status"],
      reason: r.reason,
      submitterId: r.submitterId,
      submitterName: r.submitterName,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
      reviewedAt: r.reviewedAt instanceof Date ? r.reviewedAt.toISOString() : r.reviewedAt ? String(r.reviewedAt) : null,
      aiReviewId: r.aiReviewId,
      linkedDiscoveryId: r.linkedDiscoveryId,
      reqCode: r.reqCode ?? null,
      type: r.type as RequestWithReview["type"],
      domain: r.domain as RequestWithReview["domain"],
      impactLevel: r.impactLevel ?? null,
      urgencyLevel: r.urgencyLevel ?? null,
      priorityLevel: computePriorityLevel(r.impactLevel, r.urgencyLevel) as PriorityLevelValue | null,
      specItemId: r.specItemId ?? null,
      milestoneVersion: r.milestoneVersion ?? null,
      review: r.reviewClassification
        ? {
            classification: r.reviewClassification as RequestClassificationValue,
            impactScore: r.reviewImpactScore ?? 0,
            feasibilityScore: r.reviewFeasibilityScore ?? 0,
            rationale: r.reviewRationale ?? "",
            humanVerdict: (r.reviewHumanVerdict ?? null) as HumanVerdictValue | null,
            workPlanDraft: r.reviewWorkPlanDraft ?? null,
          }
        : null,
    }));
  }

  /** 단일 요구사항 + 리뷰 상세 */
  async getById(id: string) {
    const [row] = await this.db
      .select()
      .from(featureRequests)
      .where(eq(featureRequests.id, id));

    if (!row) return null;

    const review = row.aiReviewId
      ? (await this.db.select().from(requestReviews).where(eq(requestReviews.id, row.aiReviewId)))[0] ?? null
      : null;

    return { request: row, review };
  }

  /** 리뷰 상세 */
  async getReview(reviewId: string) {
    const [row] = await this.db.select().from(requestReviews).where(eq(requestReviews.id, reviewId));
    return row ?? null;
  }

  /** 이벤트 타임라인 */
  async getEvents(requestId: string) {
    return this.db
      .select()
      .from(requestEvents)
      .where(eq(requestEvents.requestId, requestId))
      .orderBy(desc(requestEvents.createdAt));
  }

  /** 작업계획 조회 */
  async getWorkPlans(requestId: string) {
    return this.db
      .select()
      .from(workPlans)
      .where(eq(workPlans.requestId, requestId))
      .orderBy(desc(workPlans.createdAt));
  }

  /** 작업계획 단건 조회 */
  async getWorkPlan(planId: string) {
    const [row] = await this.db.select().from(workPlans).where(eq(workPlans.id, planId));
    return row ?? null;
  }

  /** 작업계획 실행 이력 조회 */
  async getWorkPlanRuns(planId: string): Promise<WorkPlanRun[]> {
    const rows = await this.db
      .select()
      .from(workPlanRuns)
      .where(eq(workPlanRuns.workPlanId, planId))
      .orderBy(desc(workPlanRuns.createdAt));

    return rows.map((r) => ({
      id: r.id,
      workPlanId: r.workPlanId,
      stepIndex: r.stepIndex,
      status: r.status as WorkPlanRun["status"],
      agentInput: r.agentInput,
      agentOutput: r.agentOutput,
      modelId: r.modelId,
      tokenUsage: r.tokenUsage ?? 0,
      errorMessage: r.errorMessage,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
      completedAt: r.completedAt instanceof Date ? r.completedAt.toISOString() : r.completedAt ? String(r.completedAt) : null,
    }));
  }

  /** 전체 작업계획 목록 (작업 현황 대시보드용) */
  async listWorkPlansWithContext(): Promise<WorkPlanWithContext[]> {
    const rows = await this.db
      .select({
        id: workPlans.id,
        requestId: workPlans.requestId,
        requestTitle: featureRequests.title,
        requestPriority: featureRequests.priority,
        title: workPlans.title,
        description: workPlans.description,
        steps: workPlans.steps,
        estimatedEffort: workPlans.estimatedEffort,
        status: workPlans.status,
        progress: workPlans.progress,
        startedAt: workPlans.startedAt,
        completedAt: workPlans.completedAt,
        createdBy: workPlans.createdBy,
        createdByName: users.name,
        createdAt: workPlans.createdAt,
        updatedAt: workPlans.updatedAt,
      })
      .from(workPlans)
      .leftJoin(featureRequests, eq(workPlans.requestId, featureRequests.id))
      .leftJoin(users, eq(workPlans.createdBy, users.id))
      .orderBy(desc(workPlans.updatedAt));

    // 각 plan의 runs 조회
    const result: WorkPlanWithContext[] = [];
    for (const r of rows) {
      const runs = await this.getWorkPlanRuns(r.id);
      result.push({
        id: r.id,
        requestId: r.requestId,
        requestTitle: r.requestTitle ?? "",
        requestPriority: r.requestPriority ?? "medium",
        title: r.title,
        description: r.description,
        steps: r.steps,
        estimatedEffort: r.estimatedEffort,
        status: r.status as WorkPlanWithContext["status"],
        progress: r.progress ?? 0,
        startedAt: r.startedAt instanceof Date ? r.startedAt.toISOString() : r.startedAt ? String(r.startedAt) : null,
        completedAt: r.completedAt instanceof Date ? r.completedAt.toISOString() : r.completedAt ? String(r.completedAt) : null,
        createdBy: r.createdBy,
        createdByName: r.createdByName,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
        updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt),
        runs,
      });
    }

    return result;
  }

  /** 상태별 카운트 */
  async countByStatus(): Promise<Record<string, number>> {
    const rows = await this.db.select({ status: featureRequests.status }).from(featureRequests);
    const counts: Record<string, number> = {};
    for (const r of rows) {
      counts[r.status] = (counts[r.status] ?? 0) + 1;
    }
    return counts;
  }

  /** 상태 목록으로 필터 */
  async listByStatuses(statuses: string[]) {
    return this.db
      .select()
      .from(featureRequests)
      .where(inArray(featureRequests.status, statuses))
      .orderBy(desc(featureRequests.createdAt));
  }

  /** 작업계획 상태별 카운트 */
  async countWorkPlansByStatus(): Promise<Record<string, number>> {
    const rows = await this.db.select({ status: workPlans.status }).from(workPlans);
    const counts: Record<string, number> = {};
    for (const r of rows) {
      counts[r.status] = (counts[r.status] ?? 0) + 1;
    }
    return counts;
  }
}
