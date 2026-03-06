/**
 * RequirementsQueryService — 읽기 전용 쿼리
 * Bounded Context: requests
 */

import { eq, desc, inArray } from "drizzle-orm";
import type { DB } from "~/db";
import { users } from "~/db/schema";
import { featureRequests, requestReviews, requestEvents, workPlans } from "../db/schema";
import type { RequestWithReview } from "../types";
import type { RequestClassificationValue, HumanVerdictValue } from "../constants";

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
}
