import { eq, and, count } from "drizzle-orm";
import type { DB } from "~/db";
import {
  discoveries,
  experiments,
  evidence,
  eventLogs,
  methodRuns,
  gatePackages,
  gateApprovals,
  assumptions,
  MethodRunStatus,
  GateApprovalDecision,
} from "~/db/schema";
import { DiscoveryStatus } from "~/db/schema";
import { DiscoveryValidationRules } from "~/lib/validation/discovery-rules";
import type {
  Discovery,
  CreateDiscoveryInput,
  UpdateDiscoveryInput,
  AddExperimentInput,
  AddEvidenceInput,
  CompleteExperimentInput,
} from "./types";
import { DiscoveryQueryService } from "./query";

export class DiscoveryEntityService {
  private queryService: DiscoveryQueryService;

  constructor(private db: DB) {
    this.queryService = new DiscoveryQueryService(db);
  }

  /**
   * 생성
   */
  async create(
    data: CreateDiscoveryInput,
    actorId: string,
  ): Promise<Discovery> {
    const discoveryId = crypto.randomUUID();

    await this.db.insert(discoveries).values({
      id: discoveryId,
      title: data.title,
      seedSummary: data.seedSummary,
      seedLinks: data.seedLinks || null,
      sourceType: data.sourceType,
      status: DiscoveryStatus.DISCOVERY,
      ownerId: data.ownerId,
      tenantId: data.tenantId,
    });

    await this.db.insert(eventLogs).values({
      id: crypto.randomUUID(),
      actorId,
      discoveryId,
      eventType: "CREATE_DISCOVERY",
      metadata: { title: data.title, sourceType: data.sourceType },
    });

    const created = await this.queryService.getById(discoveryId);
    return created!;
  }

  /**
   * Discovery 필드 수정
   */
  async update(
    id: string,
    data: UpdateDiscoveryInput,
    actorId: string,
  ): Promise<void> {
    const discovery = await this.queryService.getById(id);
    if (!discovery) {
      throw new Error(`Discovery를 찾을 수 없습니다: ${id}`);
    }

    if (
      discovery.status !== DiscoveryStatus.DISCOVERY &&
      discovery.status !== DiscoveryStatus.IDEA_CARD
    ) {
      throw new Error("INBOX/OPEN 상태에서만 편집할 수 있습니다");
    }

    await this.db
      .update(discoveries)
      .set({
        title: data.title,
        seedSummary: data.seedSummary,
        seedLinks: data.seedLinks || null,
        sourceType: data.sourceType,
        targetSegment: data.targetSegment || null,
        valueProposition: data.valueProposition || null,
        updatedAt: new Date(),
      })
      .where(eq(discoveries.id, id));

    await this.db.insert(eventLogs).values({
      id: crypto.randomUUID(),
      actorId,
      discoveryId: id,
      eventType: "UPDATE_DISCOVERY",
      metadata: { title: data.title, sourceType: data.sourceType },
    });
  }

  /**
   * 실험 추가
   */
  async addExperiment(
    discoveryId: string,
    input: AddExperimentInput,
    actorId: string,
  ): Promise<string> {
    const discovery = await this.queryService.getById(discoveryId);
    if (!discovery) {
      throw new Error(`Discovery를 찾을 수 없습니다: ${discoveryId}`);
    }

    if (discovery.status !== DiscoveryStatus.IDEA_CARD) {
      throw new Error(
        "OPEN 상태의 Discovery만 실험을 추가할 수 있습니다",
      );
    }

    // 실험 제한 검증 (최대 3개)
    const expCount = await this.db
      .select({ count: count() })
      .from(experiments)
      .where(eq(experiments.discoveryId, discoveryId));
    if ((expCount[0]?.count || 0) >= 3) {
      throw new Error("최대 3개 실험만 가능합니다");
    }

    const experimentId = crypto.randomUUID();
    await this.db.insert(experiments).values({
      id: experimentId,
      discoveryId,
      hypothesis: input.hypothesis,
      minimalAction: input.minimalAction,
      deadline: input.deadline,
      expectedEvidence: input.expectedEvidence,
    });

    await this.db
      .update(discoveries)
      .set({ updatedAt: new Date() })
      .where(eq(discoveries.id, discoveryId));

    await this.db.insert(eventLogs).values({
      id: crypto.randomUUID(),
      actorId,
      discoveryId,
      eventType: "ADD_EXPERIMENT",
      metadata: { experimentId, hypothesis: input.hypothesis },
    });

    return experimentId;
  }

  /**
   * 근거 추가
   */
  async addEvidence(
    discoveryId: string,
    input: AddEvidenceInput,
    actorId: string,
  ): Promise<string> {
    const discovery = await this.queryService.getById(discoveryId);
    if (!discovery) {
      throw new Error(`Discovery를 찾을 수 없습니다: ${discoveryId}`);
    }

    if (discovery.status === DiscoveryStatus.DISCOVERY) {
      throw new Error("INBOX 상태에서는 Evidence를 추가할 수 없습니다");
    }

    const evidenceId = crypto.randomUUID();
    await this.db.insert(evidence).values({
      id: evidenceId,
      discoveryId,
      experimentId: input.experimentId || null,
      type: input.type,
      strength: input.strength,
      content: input.content,
      linkOrAttachment: input.linkOrAttachment || null,
      createdById: input.createdById,
    });

    await this.db
      .update(discoveries)
      .set({ updatedAt: new Date() })
      .where(eq(discoveries.id, discoveryId));

    await this.db.insert(eventLogs).values({
      id: crypto.randomUUID(),
      actorId,
      discoveryId,
      eventType: "ADD_EVIDENCE",
      metadata: { evidenceId, type: input.type, strength: input.strength },
    });

    return evidenceId;
  }

  /**
   * 실험 완료 처리
   */
  async completeExperiment(
    discoveryId: string,
    input: CompleteExperimentInput,
    actorId: string,
  ): Promise<void> {
    const experiment = await this.db.query.experiments.findFirst({
      where: and(
        eq(experiments.id, input.experimentId),
        eq(experiments.discoveryId, discoveryId),
      ),
    });

    if (!experiment) {
      throw new Error("실험을 찾을 수 없습니다");
    }

    if (experiment.completedAt) {
      throw new Error("이미 완료된 실험입니다");
    }

    await this.db
      .update(experiments)
      .set({
        resultSummary: input.resultSummary,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(experiments.id, input.experimentId));

    await this.db
      .update(discoveries)
      .set({ updatedAt: new Date() })
      .where(eq(discoveries.id, discoveryId));

    await this.db.insert(eventLogs).values({
      id: crypto.randomUUID(),
      actorId,
      discoveryId,
      eventType: "COMPLETE_EXPERIMENT",
      metadata: {
        experimentId: input.experimentId,
        resultSummary: input.resultSummary,
      },
    });
  }

  // ============================================================================
  // 방법론 실행 (methods.tsx)
  // ============================================================================

  /**
   * 방법론 실행 시작 (methodRuns insert + eventLog)
   */
  async startMethodRun(
    discoveryId: string,
    methodPackId: string,
    executorId: string,
  ): Promise<string> {
    // 이미 실행 중인지 확인
    const existing = await this.db
      .select()
      .from(methodRuns)
      .where(
        and(
          eq(methodRuns.discoveryId, discoveryId),
          eq(methodRuns.methodPackId, methodPackId),
          eq(methodRuns.status, MethodRunStatus.RUNNING),
        ),
      );

    if (existing.length > 0) {
      throw new Error("이미 실행 중인 방법론입니다.");
    }

    const runId = crypto.randomUUID();
    await this.db.insert(methodRuns).values({
      id: runId,
      discoveryId,
      methodPackId,
      status: MethodRunStatus.RUNNING,
      executorId,
    });

    await this.db.insert(eventLogs).values({
      id: crypto.randomUUID(),
      actorId: executorId,
      discoveryId,
      eventType: "START_METHOD_RUN",
      metadata: { methodPackId },
    });

    return runId;
  }

  // ============================================================================
  // Gate 패키지 (gate.tsx)
  // ============================================================================

  /**
   * Gate 패키지 초안 생성/갱신 (evidence, experiments, methodRuns, assumptions 집계)
   */
  async draftGatePackage(
    discoveryId: string,
    gateType: string,
    actorId: string,
  ): Promise<void> {
    // 데이터 수집
    const [allEvidence, allExperiments, runs, allAssumptions] = await Promise.all([
      this.db.select().from(evidence).where(eq(evidence.discoveryId, discoveryId)),
      this.db.select().from(experiments).where(eq(experiments.discoveryId, discoveryId)),
      this.db.select().from(methodRuns).where(eq(methodRuns.discoveryId, discoveryId)),
      this.db.select().from(assumptions).where(eq(assumptions.discoveryId, discoveryId)),
    ]);

    const completedRuns = runs.filter((r) => r.status === MethodRunStatus.COMPLETED);
    const strongEvidence = allEvidence.filter((e) => e.strength === "A" || e.strength === "B");
    const confirmedEvidence = allEvidence.filter((e) => e.reliabilityLabel === "confirmed");
    const completedExperiments = allExperiments.filter((e) => e.completedAt);
    const validatedAssumptions = allAssumptions.filter((a) => a.status === "VALIDATED");

    // readiness score 계산
    let readinessScore = 0;
    readinessScore += Math.min(strongEvidence.length, 2) * 15;
    readinessScore += Math.min(confirmedEvidence.length, 2) * 5;
    readinessScore += Math.min(completedExperiments.length, 2) * 10;
    readinessScore += Math.min(completedRuns.length, 2) * 10;
    if (allAssumptions.length > 0) {
      readinessScore += Math.round(
        (validatedAssumptions.length / allAssumptions.length) * 20,
      );
    } else {
      readinessScore += 10;
    }
    readinessScore = Math.min(readinessScore, 100);

    // 비판적 검증 4종 (v1.4 §7.3)
    const criticalChecksResult = await DiscoveryValidationRules.validateCriticalChecks(
      this.db,
      discoveryId,
    );

    const scorecard = {
      evidenceCount: allEvidence.length,
      strongEvidenceCount: strongEvidence.length,
      confirmedEvidenceCount: confirmedEvidence.length,
      experimentCount: allExperiments.length,
      completedExperimentCount: completedExperiments.length,
      methodRunCount: completedRuns.length,
      assumptionCount: allAssumptions.length,
      validatedAssumptionCount: validatedAssumptions.length,
      openAssumptionCount: allAssumptions.filter((a) => a.status === "OPEN").length,
      readinessScore,
      criticalChecks: criticalChecksResult,
    };

    const evidenceSummary = allEvidence.map((e) => ({
      id: e.id,
      type: e.type,
      strength: e.strength,
      reliabilityLabel: e.reliabilityLabel,
      content: e.content.slice(0, 100),
      hasSource: !!(e.sourceUrl || e.linkOrAttachment),
      hasDate: !!e.publishedOrObservedDate,
    }));

    const methodRunSummary = completedRuns.map((r) => ({
      runId: r.id,
      methodPackId: r.methodPackId,
      completedAt: r.completedAt?.toISOString(),
      hasOutput: !!r.structuredOutput,
    }));

    const assumptionsSummary = allAssumptions.map((a) => ({
      id: a.id,
      statement: a.statement,
      status: a.status,
      refutationQuestions: a.refutationQuestions,
    }));

    // 기존 패키지 upsert
    const existing = await this.db
      .select()
      .from(gatePackages)
      .where(
        and(
          eq(gatePackages.discoveryId, discoveryId),
          eq(gatePackages.gateType, gateType),
        ),
      )
      .limit(1);

    if (existing[0]) {
      await this.db
        .update(gatePackages)
        .set({
          autoDraftedAt: new Date(),
          scorecard,
          methodRunSummary,
          evidenceSummary,
          assumptions: assumptionsSummary,
        })
        .where(eq(gatePackages.id, existing[0].id));
    } else {
      await this.db.insert(gatePackages).values({
        id: crypto.randomUUID(),
        discoveryId,
        gateType,
        autoDraftedAt: new Date(),
        decision: "PENDING",
        scorecard,
        methodRunSummary,
        evidenceSummary,
        assumptions: assumptionsSummary,
      });
    }

    await this.db.insert(eventLogs).values({
      id: crypto.randomUUID(),
      actorId,
      discoveryId,
      eventType: "DRAFT_GATE_PACKAGE",
      metadata: { gateType },
    });
  }

  /**
   * Gate 승인 요청 (gateApprovals insert + eventLog)
   */
  async requestGateApproval(
    discoveryId: string,
    gatePackageId: string,
    reviewerId: string,
    actorId: string,
  ): Promise<void> {
    const slaDeadline = new Date();
    slaDeadline.setDate(slaDeadline.getDate() + 3); // 3일 SLA

    const approvalId = crypto.randomUUID();
    await this.db.insert(gateApprovals).values({
      id: approvalId,
      gatePackageId,
      reviewerId,
      decision: GateApprovalDecision.PENDING,
      slaDeadline,
    });

    await this.db.insert(eventLogs).values({
      id: crypto.randomUUID(),
      actorId,
      discoveryId,
      eventType: "REQUEST_GATE_APPROVAL",
      metadata: { gatePackageId, reviewerId, approvalId },
    });
  }

  /**
   * Gate 승인 결정 제출 (approval update + 집계 update + eventLog)
   */
  async submitGateDecision(
    discoveryId: string,
    approvalId: string,
    decision: string,
    comment: string | null,
    actorId: string,
  ): Promise<void> {
    // approval 단건 조회
    const approval = await this.db.query.gateApprovals.findFirst({
      where: eq(gateApprovals.id, approvalId),
    });
    if (!approval || approval.reviewerId !== actorId) {
      throw new Error("본인에게 할당된 승인만 처리할 수 있습니다.");
    }

    await this.db
      .update(gateApprovals)
      .set({
        decision,
        comment: comment || null,
        decidedAt: new Date(),
      })
      .where(eq(gateApprovals.id, approvalId));

    await this.db.insert(eventLogs).values({
      id: crypto.randomUUID(),
      actorId,
      discoveryId,
      eventType: "SUBMIT_GATE_DECISION",
      metadata: {
        approvalId,
        gatePackageId: approval.gatePackageId,
        decision,
        comment: comment || null,
      },
    });

    // Auto-aggregate: 패키지의 모든 승인 결정 여부 확인
    const allApprovals = await this.db
      .select()
      .from(gateApprovals)
      .where(eq(gateApprovals.gatePackageId, approval.gatePackageId));

    const allDecided = allApprovals.every((a) =>
      a.id === approvalId ? true : a.decision !== GateApprovalDecision.PENDING,
    );

    if (allDecided) {
      const decisions = allApprovals.map((a) =>
        a.id === approvalId ? decision : a.decision,
      );
      const hasRejection = decisions.includes(GateApprovalDecision.REJECTED);
      const hasConditional = decisions.includes(GateApprovalDecision.CONDITIONAL);
      const aggregateDecision = hasRejection
        ? "NO_GO"
        : hasConditional
          ? "CONDITIONAL"
          : "GO";

      await this.db
        .update(gatePackages)
        .set({
          decision: aggregateDecision,
          decidedAt: new Date(),
          approverId: actorId,
        })
        .where(eq(gatePackages.id, approval.gatePackageId));
    }
  }
}
