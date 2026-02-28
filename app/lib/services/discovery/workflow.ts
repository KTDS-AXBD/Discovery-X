import { eq } from "drizzle-orm";
import type { DB } from "~/db";
import { discoveries, experiments, eventLogs } from "~/db/schema";
import { DiscoveryStatus } from "~/db/schema";
import { DiscoveryValidationRules } from "~/lib/validation/discovery-rules";
import { ALLOWED_TRANSITIONS, ACTIVE_STATUSES } from "~/lib/constants/status";
import type {
  Discovery,
  ChangeOwnerInput,
  PromoteInput,
  SubmitApprovalInput,
  ApproveDecisionResult,
  ChangeReviewerInput,
  ChangeGatekeeperInput,
  RequestExtensionInput,
} from "./types";
import { DiscoveryQueryService } from "./query";

export class DiscoveryWorkflowService {
  private queryService: DiscoveryQueryService;

  constructor(private db: DB) {
    this.queryService = new DiscoveryQueryService(db);
  }

  /**
   * 상태 전환 (validateTransition 경유 필수)
   */
  async transition(
    id: string,
    targetStatus: string,
    actorId: string,
  ): Promise<Discovery> {
    const discovery = await this.queryService.getById(id);
    if (!discovery) {
      throw new Error(`Discovery를 찾을 수 없습니다: ${id}`);
    }

    DiscoveryValidationRules.validateTransition(
      discovery.status,
      targetStatus,
    );

    await this.db
      .update(discoveries)
      .set({
        status: targetStatus,
        stageUpdatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(discoveries.id, id));

    await this.db.insert(eventLogs).values({
      id: crypto.randomUUID(),
      actorId,
      discoveryId: id,
      eventType: "STATUS_TRANSITION",
      metadata: {
        fromStatus: discovery.status,
        toStatus: targetStatus,
      },
    });

    const updated = await this.queryService.getById(id);
    return updated!;
  }

  /**
   * Owner 변경
   */
  async changeOwner(input: ChangeOwnerInput): Promise<void> {
    const discovery = await this.queryService.getById(input.discoveryId);
    if (!discovery) {
      throw new Error(
        `Discovery를 찾을 수 없습니다: ${input.discoveryId}`,
      );
    }

    if (!(ACTIVE_STATUSES as readonly string[]).includes(discovery.status)) {
      throw new Error(
        "활성 상태(DISCOVERY~GATE2)에서만 Owner를 변경할 수 있습니다",
      );
    }

    await this.db
      .update(discoveries)
      .set({ ownerId: input.newOwnerId, updatedAt: new Date() })
      .where(eq(discoveries.id, input.discoveryId));

    await this.db.insert(eventLogs).values({
      id: crypto.randomUUID(),
      actorId: input.actorId,
      discoveryId: input.discoveryId,
      eventType: "CHANGE_OWNER",
      metadata: {
        previousOwnerId: discovery.ownerId,
        newOwnerId: input.newOwnerId,
        handoverNote: input.handoverNote,
      },
    });
  }

  /**
   * 허용된 전환 목록 조회
   */
  getAllowedTransitions(currentStatus: string): string[] {
    return ALLOWED_TRANSITIONS[currentStatus] ?? [];
  }

  /**
   * INBOX → OPEN 승격 (실험 생성 + Owner 설정 + 상태 전환)
   */
  async promote(
    id: string,
    input: PromoteInput,
    actorId: string,
  ): Promise<Discovery> {
    const discovery = await this.queryService.getById(id);
    if (!discovery) {
      throw new Error(`Discovery를 찾을 수 없습니다: ${id}`);
    }

    if (discovery.status !== DiscoveryStatus.DISCOVERY) {
      throw new Error("INBOX 상태의 Discovery만 승격할 수 있습니다");
    }

    DiscoveryValidationRules.validateOwnerRequired(input.ownerId);
    const dueDate = DiscoveryValidationRules.calculateDueDate(
      discovery.createdAt,
    );

    // 첫 번째 실험 생성
    const experimentId = crypto.randomUUID();
    await this.db.insert(experiments).values({
      id: experimentId,
      discoveryId: id,
      hypothesis: input.firstExperiment.hypothesis,
      minimalAction: input.firstExperiment.minimalAction,
      deadline: input.firstExperiment.deadline,
      expectedEvidence: input.firstExperiment.expectedEvidence,
    });

    // Discovery 상태 + Owner 업데이트
    await this.db
      .update(discoveries)
      .set({
        status: DiscoveryStatus.IDEA_CARD,
        ownerId: input.ownerId,
        reviewerId: input.reviewerId ?? null,
        dueDate,
        updatedAt: new Date(),
      })
      .where(eq(discoveries.id, id));

    await this.db.insert(eventLogs).values({
      id: crypto.randomUUID(),
      actorId,
      discoveryId: id,
      eventType: "PROMOTE_OPEN",
      metadata: {
        ownerId: input.ownerId,
        experimentId,
        dueDate: dueDate.toISOString(),
      },
    });

    const updated = await this.queryService.getById(id);
    return updated!;
  }

  /**
   * 승인 요청 (PENDING 설정 + 이벤트 로그)
   */
  async submitForApproval(
    id: string,
    input: SubmitApprovalInput,
    actorId: string,
  ): Promise<void> {
    const discovery = await this.queryService.getById(id);
    if (!discovery) {
      throw new Error(`Discovery를 찾을 수 없습니다: ${id}`);
    }

    DiscoveryValidationRules.validateReviewerRequired(discovery.reviewerId);
    DiscoveryValidationRules.validateNoApprovalPending(
      discovery.approvalStatus,
    );

    await this.db
      .update(discoveries)
      .set({
        approvalStatus: "PENDING",
        pendingDecision: input.pendingDecision,
        pendingDecisionData: input.pendingDecisionData,
        updatedAt: new Date(),
      })
      .where(eq(discoveries.id, id));

    await this.db.insert(eventLogs).values({
      id: crypto.randomUUID(),
      actorId,
      discoveryId: id,
      eventType: "SUBMIT_FOR_APPROVAL",
      metadata: {
        pendingDecision: input.pendingDecision,
        ...input.pendingDecisionData,
      },
    });
  }

  /**
   * 승인 결정 적용 (Reviewer가 PENDING 결정을 승인)
   */
  async approveDecision(
    id: string,
    actorId: string,
    comment?: string,
  ): Promise<ApproveDecisionResult> {
    const discovery = await this.queryService.getById(id);
    if (!discovery) {
      throw new Error(`Discovery를 찾을 수 없습니다: ${id}`);
    }

    if (discovery.approvalStatus !== "PENDING") {
      throw new Error("승인 대기 중인 결정이 없습니다");
    }

    const pendingData = discovery.pendingDecisionData as Record<string, unknown> | null;
    const pendingDecision = discovery.pendingDecision;

    const updateData: Record<string, unknown> = {
      approvalStatus: "APPROVED",
      approvalComment: comment || null,
      approvedAt: new Date(),
      approvedBy: actorId,
      pendingDecision: null,
      pendingDecisionData: null,
      updatedAt: new Date(),
    };

    if (pendingDecision === DiscoveryStatus.GATE1) {
      updateData.status = DiscoveryStatus.GATE1;
      updateData.decisionState = DiscoveryStatus.GATE1;
      updateData.decisionRationale = pendingData?.decisionRationale || null;
      updateData.decidedAt = new Date();
    } else if (pendingDecision === DiscoveryStatus.HOLD) {
      updateData.status = DiscoveryStatus.HOLD;
      updateData.decisionState = DiscoveryStatus.HOLD;
      updateData.decisionRationale = pendingData?.decisionRationale || null;
      updateData.notNowTriggerType = pendingData?.notNowTriggerType || null;
      updateData.notNowTriggerCondition = pendingData?.notNowTriggerCondition || null;
      updateData.revisitDate = pendingData?.revisitDate
        ? new Date(pendingData.revisitDate as string)
        : null;
      updateData.decidedAt = new Date();
    } else if (pendingDecision === DiscoveryStatus.DROP) {
      updateData.status = DiscoveryStatus.DROP;
      updateData.decisionState = DiscoveryStatus.DROP;
      updateData.decisionRationale = pendingData?.decisionRationale || null;
      updateData.deadEndFailurePattern = pendingData?.deadEndFailurePattern || null;
      updateData.deadEndEvidenceReason = pendingData?.deadEndEvidenceReason || null;
      updateData.decidedAt = new Date();
    } else if (pendingDecision === DiscoveryStatus.IDEA_CARD) {
      updateData.status = DiscoveryStatus.IDEA_CARD;
      updateData.decisionRationale = pendingData?.extensionRationale || null;
      if (pendingData?.newDueDate) {
        updateData.dueDate = new Date(pendingData.newDueDate as string);
      }
    }

    await this.db
      .update(discoveries)
      .set(updateData)
      .where(eq(discoveries.id, id));

    await this.db.insert(eventLogs).values({
      id: crypto.randomUUID(),
      actorId,
      discoveryId: id,
      eventType: "APPROVE_DECISION",
      metadata: {
        decision: pendingDecision,
        comment: comment || null,
      },
    });

    return { pendingDecision };
  }

  /**
   * 결정 거부 (Reviewer가 PENDING 결정을 반려)
   */
  async rejectDecision(
    id: string,
    actorId: string,
    comment?: string,
  ): Promise<ApproveDecisionResult> {
    const discovery = await this.queryService.getById(id);
    if (!discovery) {
      throw new Error(`Discovery를 찾을 수 없습니다: ${id}`);
    }

    if (discovery.approvalStatus !== "PENDING") {
      throw new Error("승인 대기 중인 결정이 없습니다");
    }

    const pendingDecision = discovery.pendingDecision;

    await this.db
      .update(discoveries)
      .set({
        approvalStatus: "REJECTED",
        approvalComment: comment || null,
        rejectedAt: new Date(),
        pendingDecision: null,
        pendingDecisionData: null,
        updatedAt: new Date(),
      })
      .where(eq(discoveries.id, id));

    await this.db.insert(eventLogs).values({
      id: crypto.randomUUID(),
      actorId,
      discoveryId: id,
      eventType: "REJECT_DECISION",
      metadata: {
        decision: pendingDecision,
        comment: comment || null,
      },
    });

    return { pendingDecision };
  }

  /**
   * 연장 요청 (PENDING 상태로 설정)
   */
  async requestExtension(
    id: string,
    input: RequestExtensionInput,
    actorId: string,
  ): Promise<void> {
    const discovery = await this.queryService.getById(id);
    if (!discovery) {
      throw new Error(`Discovery를 찾을 수 없습니다: ${id}`);
    }

    if (discovery.status !== DiscoveryStatus.IDEA_CARD) {
      throw new Error("OPEN 상태의 Discovery만 연장 요청할 수 있습니다");
    }

    DiscoveryValidationRules.validateReviewerRequired(discovery.reviewerId);
    DiscoveryValidationRules.validateNoApprovalPending(discovery.approvalStatus);

    await this.db
      .update(discoveries)
      .set({
        approvalStatus: "PENDING",
        pendingDecision: DiscoveryStatus.IDEA_CARD,
        pendingDecisionData: {
          extensionRationale: input.extensionRationale,
          previousDueDate: input.previousDueDate
            ? input.previousDueDate.toISOString()
            : null,
          newDueDate: input.newDueDate.toISOString(),
        },
        updatedAt: new Date(),
      })
      .where(eq(discoveries.id, id));

    await this.db.insert(eventLogs).values({
      id: crypto.randomUUID(),
      actorId,
      discoveryId: id,
      eventType: "SUBMIT_FOR_APPROVAL",
      metadata: {
        pendingDecision: DiscoveryStatus.IDEA_CARD,
        extensionRationale: input.extensionRationale,
        previousDueDate: input.previousDueDate
          ? input.previousDueDate.toISOString()
          : null,
        newDueDate: input.newDueDate.toISOString(),
      },
    });
  }

  /**
   * Reviewer 변경
   */
  async changeReviewer(input: ChangeReviewerInput): Promise<void> {
    const discovery = await this.queryService.getById(input.discoveryId);
    if (!discovery) {
      throw new Error(
        `Discovery를 찾을 수 없습니다: ${input.discoveryId}`,
      );
    }

    if (
      !ACTIVE_STATUSES.includes(
        discovery.status as (typeof ACTIVE_STATUSES)[number],
      )
    ) {
      throw new Error(
        "활성 상태에서만 Reviewer를 변경할 수 있습니다",
      );
    }

    await this.db
      .update(discoveries)
      .set({
        reviewerId: input.newReviewerId,
        updatedAt: new Date(),
      })
      .where(eq(discoveries.id, input.discoveryId));

    await this.db.insert(eventLogs).values({
      id: crypto.randomUUID(),
      actorId: input.actorId,
      discoveryId: input.discoveryId,
      eventType: "CHANGE_REVIEWER",
      metadata: {
        previousReviewerId: discovery.reviewerId,
        newReviewerId: input.newReviewerId,
      },
    });
  }

  /**
   * Gatekeeper 변경
   */
  async changeGatekeeper(input: ChangeGatekeeperInput): Promise<void> {
    const discovery = await this.queryService.getById(input.discoveryId);
    if (!discovery) {
      throw new Error(
        `Discovery를 찾을 수 없습니다: ${input.discoveryId}`,
      );
    }

    await this.db
      .update(discoveries)
      .set({
        gatekeeperId: input.newGatekeeperId,
        updatedAt: new Date(),
      })
      .where(eq(discoveries.id, input.discoveryId));

    await this.db.insert(eventLogs).values({
      id: crypto.randomUUID(),
      actorId: input.actorId,
      discoveryId: input.discoveryId,
      eventType: "CHANGE_GATEKEEPER",
      metadata: {
        previousGatekeeperId: discovery.gatekeeperId,
        newGatekeeperId: input.newGatekeeperId,
      },
    });
  }
}
