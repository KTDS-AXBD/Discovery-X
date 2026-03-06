/**
 * RequirementsEntityService — CRUD
 * Bounded Context: requests
 */

import { eq } from "drizzle-orm";
import type { DB } from "~/db";
import { featureRequests, requestReviews, requestEvents, workPlans } from "../db/schema";

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
  }>) {
    await this.db
      .update(featureRequests)
      .set(updates)
      .where(eq(featureRequests.id, id));
  }

  /** 요구사항 삭제 */
  async deleteRequest(id: string) {
    await this.db.delete(featureRequests).where(eq(featureRequests.id, id));
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

  /** 작업계획 생성 */
  async createWorkPlan(input: {
    requestId: string;
    reviewId?: string;
    title: string;
    description: string;
    steps?: string[];
    estimatedEffort?: string;
    createdBy?: string;
  }) {
    const [plan] = await this.db
      .insert(workPlans)
      .values({
        requestId: input.requestId,
        reviewId: input.reviewId ?? null,
        title: input.title,
        description: input.description,
        steps: input.steps ?? null,
        estimatedEffort: input.estimatedEffort ?? null,
        createdBy: input.createdBy ?? null,
      })
      .returning();
    return plan;
  }

  /** 작업계획 업데이트 */
  async updateWorkPlan(id: string, updates: Partial<{
    status: string;
    linkedDiscoveryId: string;
    updatedAt: Date;
  }>) {
    await this.db
      .update(workPlans)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(workPlans.id, id));
  }
}
