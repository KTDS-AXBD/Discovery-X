/**
 * RequirementsWorkflowService — 상태 전환 + HITL
 * Bounded Context: requests
 */

import type { DB } from "~/db";
import { alerts, discoveries } from "~/db";
import { ALLOWED_TRANSITIONS, RequestStatus, RequestEventType, RequestClassification } from "../constants";
import type { HumanVerdictInput } from "../types";
import { RequirementsEntityService } from "./entity";
import { RequirementsQueryService } from "./query";
import { NotFoundError, ValidationError } from "~/lib/errors";

export class RequirementsWorkflowService {
  private entity: RequirementsEntityService;
  private query: RequirementsQueryService;

  constructor(private db: DB) {
    this.entity = new RequirementsEntityService(db);
    this.query = new RequirementsQueryService(db);
  }

  /** 상태 전환 검증 */
  validateTransition(from: string, to: string): { valid: boolean; error?: string } {
    const allowed = ALLOWED_TRANSITIONS[from];
    if (!allowed) {
      return { valid: false, error: `알 수 없는 상태: ${from}` };
    }
    if (!allowed.includes(to)) {
      return { valid: false, error: `${from} → ${to} 전환은 허용되지 않습니다. 가능: ${allowed.join(", ") || "없음"}` };
    }
    return { valid: true };
  }

  /** 상태 전환 실행 */
  async transition(requestId: string, toStatus: string, actorId?: string) {
    const result = await this.query.getById(requestId);
    if (!result) throw new NotFoundError("Request", requestId);

    const fromStatus = result.request.status;
    const validation = this.validateTransition(fromStatus, toStatus);
    if (!validation.valid) {
      throw new ValidationError("status", validation.error!);
    }

    await this.entity.updateRequest(requestId, { status: toStatus });
    await this.entity.logEvent({
      requestId,
      eventType: RequestEventType.STATUS_CHANGED,
      actorId,
      actorType: actorId ? "user" : "system",
      payload: { from: fromStatus, to: toStatus },
    });

    return { from: fromStatus, to: toStatus };
  }

  /** AI 검토 시작: OPEN → AI_REVIEWING */
  async startAiReview(requestId: string, actorId?: string) {
    return this.transition(requestId, RequestStatus.AI_REVIEWING, actorId);
  }

  /** AI 검토 완료: AI_REVIEWING → CLASSIFIED → (HUMAN_REVIEW | REJECTED) */
  async completeAiReview(requestId: string, reviewId: string, classification?: string) {
    await this.entity.updateRequest(requestId, {
      status: RequestStatus.CLASSIFIED,
      aiReviewId: reviewId,
    });
    await this.entity.logEvent({
      requestId,
      eventType: RequestEventType.AI_REVIEW_COMPLETED,
      actorType: "agent",
      payload: { reviewId, classification },
    });

    // OUT_OF_SCOPE → 자동 보류 (사람 검토 생략)
    if (classification === RequestClassification.OUT_OF_SCOPE) {
      await this.entity.updateRequest(requestId, {
        status: RequestStatus.REJECTED,
        reason: "AI 분류: 프로젝트 범위 밖 (OUT_OF_SCOPE)",
      });
      await this.entity.logEvent({
        requestId,
        eventType: RequestEventType.STATUS_CHANGED,
        actorType: "system",
        payload: { from: RequestStatus.CLASSIFIED, to: RequestStatus.REJECTED, autoRejected: true },
      });
      return;
    }

    // 그 외: CLASSIFIED → HUMAN_REVIEW
    await this.entity.updateRequest(requestId, { status: RequestStatus.HUMAN_REVIEW });
    await this.entity.logEvent({
      requestId,
      eventType: RequestEventType.STATUS_CHANGED,
      actorType: "system",
      payload: { from: RequestStatus.CLASSIFIED, to: RequestStatus.HUMAN_REVIEW },
    });
  }

  /** HITL 판정: HUMAN_REVIEW → ACCEPTED / REJECTED */
  async submitHumanVerdict(input: HumanVerdictInput) {
    const result = await this.query.getById(input.requestId);
    if (!result) throw new NotFoundError("Request", input.requestId);
    if (!result.review) throw new NotFoundError("Review", "unknown");

    // 리뷰에 판정 저장
    await this.entity.saveHumanVerdict(result.review.id, {
      verdict: input.verdict,
      comment: input.comment,
      reviewerId: input.reviewerId,
    });

    // 상태 전환
    let newStatus: string;
    if (input.verdict === "APPROVED") {
      newStatus = RequestStatus.ACCEPTED;
    } else if (input.verdict === "REJECTED") {
      newStatus = RequestStatus.REJECTED;
    } else {
      // NEEDS_REVISION → CLASSIFIED로 되돌림
      newStatus = RequestStatus.CLASSIFIED;
    }

    // ACCEPTED 시 REQ 코드 자동 부여
    const extraUpdates: Record<string, unknown> = {};
    if (newStatus === RequestStatus.ACCEPTED) {
      const reqCode = await this.entity.generateReqCode();
      extraUpdates.reqCode = reqCode;
    }

    await this.entity.updateRequest(input.requestId, {
      status: newStatus,
      reviewerId: input.reviewerId,
      reviewedAt: new Date(),
      ...(input.verdict === "REJECTED" && input.comment ? { reason: input.comment } : {}),
      ...extraUpdates,
    });

    await this.entity.logEvent({
      requestId: input.requestId,
      eventType: RequestEventType.HUMAN_VERDICT,
      actorId: input.reviewerId,
      actorType: "user",
      payload: { verdict: input.verdict, comment: input.comment },
    });

    // 제출자 알림
    if (result.request.submitterId !== input.reviewerId) {
      const statusLabel = newStatus === "ACCEPTED" ? "반영" : newStatus === "REJECTED" ? "보류" : "재검토";
      await this.db.insert(alerts).values({
        id: crypto.randomUUID(),
        severity: "info",
        message: `요구사항 "${result.request.title}"이(가) ${statusLabel}되었습니다.`,
        discoveryId: result.request.linkedDiscoveryId,
      });
    }

    // ACCEPTED + NEW_VALUABLE → Discovery 자동 생성
    if (newStatus === RequestStatus.ACCEPTED && result.review.classification === RequestClassification.NEW_VALUABLE) {
      await this.linkDiscovery(input.requestId, result.request.title, result.request.description, input.reviewerId);
    }

    return { status: newStatus };
  }

  /** 표준 라이프사이클: ACCEPTED → PLANNED (분류 메타 설정) */
  async planRequest(requestId: string, input: {
    actorId: string;
    type?: string;
    domain?: string;
    impactLevel?: string;
    urgencyLevel?: string;
    specItemId?: string;
    milestoneVersion?: string;
  }) {
    const result = await this.transition(requestId, RequestStatus.PLANNED, input.actorId);

    const updates: Record<string, unknown> = {};
    if (input.type) updates.type = input.type;
    if (input.domain) updates.domain = input.domain;
    if (input.impactLevel) updates.impactLevel = input.impactLevel;
    if (input.urgencyLevel) updates.urgencyLevel = input.urgencyLevel;
    if (input.specItemId) updates.specItemId = input.specItemId;
    if (input.milestoneVersion) updates.milestoneVersion = input.milestoneVersion;

    if (Object.keys(updates).length > 0) {
      await this.entity.updateRequest(requestId, updates);
    }

    await this.entity.logEvent({
      requestId,
      eventType: RequestEventType.PLANNED,
      actorId: input.actorId,
      actorType: "user",
      payload: { ...updates, specItemId: input.specItemId, milestoneVersion: input.milestoneVersion },
    });

    return result;
  }

  /** 표준 라이프사이클: PLANNED → IN_PROGRESS */
  async startProgress(requestId: string, actorId: string) {
    return this.transition(requestId, RequestStatus.IN_PROGRESS, actorId);
  }

  /** 표준 라이프사이클: IN_PROGRESS → DONE */
  async markDone(requestId: string, actorId: string) {
    return this.transition(requestId, RequestStatus.DONE, actorId);
  }

  /** ACCEPTED + NEW_VALUABLE: Discovery 자동 생성 + 연결 */
  private async linkDiscovery(requestId: string, title: string, description: string, ownerId: string) {
    const discoveryId = crypto.randomUUID().replace(/-/g, "").slice(0, 32);

    await this.db.insert(discoveries).values({
      id: discoveryId,
      title: title.slice(0, 80),
      seedSummary: description.slice(0, 400),
      sourceType: "feature_request",
      ownerId,
      status: "DISCOVERY",
    });

    await this.entity.updateRequest(requestId, { linkedDiscoveryId: discoveryId });

    await this.entity.logEvent({
      requestId,
      eventType: RequestEventType.DISCOVERY_LINKED,
      actorType: "system",
      payload: { discoveryId },
    });

    // 작업계획이 있으면 Discovery 연결
    const plans = await this.query.getWorkPlans(requestId);
    for (const plan of plans) {
      await this.entity.updateWorkPlan(plan.id, { linkedDiscoveryId: discoveryId });
    }
  }
}
