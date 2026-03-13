import { eq, desc, and, sql, lt } from "drizzle-orm";
import type { DB } from "~/db";
import {
  prds,
  prdSections,
  prdVersions,
  prdReviews,
  prdEvents,
  prdAnalysisQueue,
  AnalysisQueueStatus,
  prdStrategyQueue,
  StrategyQueueStatus,
  PrdSectionType,
  PrdStatus,
} from "~/features/prd-studio/db/schema";
import type {
  CreatePrdInput,
  UpdatePrdInput,
  PrdVersionSnapshot,
  ReviewFeedbackItem,
  ReviewScorecard,
  StrategyResult,
  GtmResult,
} from "~/features/prd-studio/types";

// ============================================================================
// Section 정렬 순서 매핑
// ============================================================================

const SECTION_SORT_ORDER: Record<string, number> = {
  [PrdSectionType.SUMMARY]: 1,
  [PrdSectionType.BACKGROUND]: 2,
  [PrdSectionType.OBJECTIVES]: 3,
  [PrdSectionType.TARGET_USERS]: 4,
  [PrdSectionType.REQUIREMENTS]: 5,
  [PrdSectionType.SOLUTION]: 6,
  [PrdSectionType.RISKS]: 7,
  [PrdSectionType.TIMELINE]: 8,
};

const ALL_SECTION_TYPES = Object.values(PrdSectionType);

// ============================================================================
// Service
// ============================================================================

export class PrdStudioService {
  constructor(private db: DB) {}

  // ────────────── CRUD ──────────────

  /** 테넌트별 PRD 목록 조회 */
  async list(tenantId: string) {
    return this.db
      .select({
        id: prds.id,
        title: prds.title,
        status: prds.status,
        version: prds.version,
        interviewProgress: prds.interviewProgress,
        createdBy: prds.createdBy,
        sourceIdeaId: prds.sourceIdeaId,
        finalRating: prds.finalRating,
        createdAt: prds.createdAt,
        updatedAt: prds.updatedAt,
      })
      .from(prds)
      .where(eq(prds.tenantId, tenantId))
      .orderBy(desc(prds.updatedAt));
  }

  /** PRD 단건 조회 + sections eager load (테넌트 격리) */
  async getById(id: string, tenantId?: string) {
    const conditions = tenantId
      ? and(eq(prds.id, id), eq(prds.tenantId, tenantId))
      : eq(prds.id, id);
    const prd = await this.db
      .select()
      .from(prds)
      .where(conditions)
      .get();
    if (!prd) return null;

    const sections = await this.db
      .select()
      .from(prdSections)
      .where(eq(prdSections.prdId, id))
      .orderBy(prdSections.sortOrder);

    return { ...prd, sections };
  }

  /** PRD 생성 + 8개 빈 섹션 자동 생성 — 생성된 ID 반환 (batch INSERT) */
  async create(input: CreatePrdInput): Promise<string> {
    const id = crypto.randomUUID();
    await this.db.insert(prds).values({
      id,
      tenantId: input.tenantId,
      title: input.title,
      createdBy: input.createdBy,
      sourceIdeaId: input.sourceIdeaId ?? null,
      status: PrdStatus.DRAFT,
    });

    // 8개 섹션 batch INSERT
    await this.db.insert(prdSections).values(
      ALL_SECTION_TYPES.map((type) => ({
        id: crypto.randomUUID(),
        prdId: id,
        type,
        sortOrder: SECTION_SORT_ORDER[type] ?? 0,
      })),
    );

    return id;
  }

  /** PRD 갱신 */
  async update(id: string, input: UpdatePrdInput) {
    await this.db
      .update(prds)
      .set({ ...input, updatedAt: sql`(unixepoch())` })
      .where(eq(prds.id, id));
  }

  /** PRD 삭제 (cascade) */
  async delete(id: string, tenantId: string) {
    await this.db
      .delete(prds)
      .where(and(eq(prds.id, id), eq(prds.tenantId, tenantId)));
  }

  // ────────────── 인터뷰 ──────────────

  /** 인터뷰 답변 저장 + interviewProgress 원자적 갱신 */
  async saveSectionAnswer(prdId: string, sectionType: string, answer: string) {
    // 섹션 답변 저장
    await this.db
      .update(prdSections)
      .set({ interviewAnswer: answer })
      .where(
        and(eq(prdSections.prdId, prdId), eq(prdSections.type, sectionType)),
      );

    // 원자적 서브쿼리로 interviewProgress 갱신 (동시성 경합 방지)
    await this.db
      .update(prds)
      .set({
        interviewProgress: sql`(SELECT COUNT(*) FROM prd_sections WHERE prd_id = ${prdId} AND interview_answer != '')`,
        updatedAt: sql`(unixepoch())`,
      })
      .where(eq(prds.id, prdId));
  }

  /** 전체 섹션 조회 */
  async getSections(prdId: string) {
    return this.db
      .select()
      .from(prdSections)
      .where(eq(prdSections.prdId, prdId))
      .orderBy(prdSections.sortOrder);
  }

  // ────────────── 버전 ──────────────

  /** 현재 상태 스냅샷 저장 — 버전 번호 반환 */
  async createVersion(
    prdId: string,
    changedBy: string,
    changeNote?: string,
  ): Promise<number> {
    // 현재 PRD + sections 조회
    const prd = await this.db
      .select()
      .from(prds)
      .where(eq(prds.id, prdId))
      .get();
    if (!prd) throw new Error("PRD not found");

    const sections = await this.getSections(prdId);

    const snapshot: PrdVersionSnapshot = {
      title: prd.title,
      sections: sections.map((s) => ({
        type: s.type,
        content: s.editedContent ?? s.generatedContent ?? "",
      })),
    };

    const newVersion = prd.version + 1;

    await this.db.insert(prdVersions).values({
      id: crypto.randomUUID(),
      prdId,
      version: newVersion,
      snapshot,
      changedBy,
      changeNote: changeNote ?? null,
    });

    // prds.version 갱신
    await this.db
      .update(prds)
      .set({ version: newVersion, updatedAt: sql`(unixepoch())` })
      .where(eq(prds.id, prdId));

    return newVersion;
  }

  /** 버전 목록 조회 */
  async listVersions(prdId: string) {
    return this.db
      .select()
      .from(prdVersions)
      .where(eq(prdVersions.prdId, prdId))
      .orderBy(desc(prdVersions.version));
  }

  // ────────────── 검토 ──────────────

  /** AI 검토 결과 저장 */
  async saveReviewResult(input: {
    prdId: string;
    round: number;
    model: string;
    verdict: string | null;
    feedbackItems: ReviewFeedbackItem[] | null;
    scorecard: ReviewScorecard | null;
    rawResponse: string | null;
    prdVersion: number;
    tokens?: number;
    latency?: number;
    error?: string;
  }) {
    const id = crypto.randomUUID();
    await this.db.insert(prdReviews).values({
      id,
      prdId: input.prdId,
      round: input.round,
      model: input.model,
      verdict: input.verdict,
      feedbackItems: input.feedbackItems,
      scorecard: input.scorecard,
      rawResponse: input.rawResponse,
      prdVersion: input.prdVersion,
      tokens: input.tokens ?? null,
      latency: input.latency ?? null,
      error: input.error ?? null,
    });
    return id;
  }

  /** 검토 결과 목록 조회 */
  async getReviews(prdId: string) {
    return this.db
      .select()
      .from(prdReviews)
      .where(eq(prdReviews.prdId, prdId))
      .orderBy(desc(prdReviews.createdAt));
  }

  // ────────────── 이벤트 ──────────────

  /** 이벤트 기록 */
  async logEvent(input: {
    prdId?: string;
    tenantId: string;
    eventType: string;
    actorId?: string;
    payload?: Record<string, unknown>;
  }) {
    await this.db.insert(prdEvents).values({
      id: crypto.randomUUID(),
      prdId: input.prdId ?? null,
      tenantId: input.tenantId,
      eventType: input.eventType,
      actorId: input.actorId ?? null,
      payload: input.payload ?? null,
    });
  }

  // ────────────── 분석 큐 ──────────────

  /** 분석 요청 큐에 추가 */
  async enqueueAnalysis(input: {
    ideaId: string;
    tenantId: string;
    requestedBy: string;
    sourceContext: string;
    sourceIds: string[];
  }): Promise<{ queueId: string; position: number }> {
    // 이미 PENDING/PROCESSING인 큐 확인
    const existing = await this.db
      .select({ id: prdAnalysisQueue.id, status: prdAnalysisQueue.status })
      .from(prdAnalysisQueue)
      .where(
        and(
          eq(prdAnalysisQueue.ideaId, input.ideaId),
          sql`${prdAnalysisQueue.status} IN ('PENDING', 'PROCESSING')`,
        ),
      )
      .get();

    if (existing) {
      throw new ConflictError("이미 분석이 진행 중이에요.");
    }

    const queueId = crypto.randomUUID();
    await this.db.insert(prdAnalysisQueue).values({
      id: queueId,
      ideaId: input.ideaId,
      tenantId: input.tenantId,
      requestedBy: input.requestedBy,
      sourceContext: input.sourceContext,
      sourceIds: input.sourceIds,
      status: AnalysisQueueStatus.PENDING,
    });

    // 큐 위치 계산 (자신보다 앞선 PENDING 수 + 1)
    const ahead = await this.db
      .select({ cnt: sql<number>`COUNT(*)` })
      .from(prdAnalysisQueue)
      .where(
        and(
          eq(prdAnalysisQueue.status, AnalysisQueueStatus.PENDING),
          lt(prdAnalysisQueue.requestedAt, sql`(unixepoch())`),
        ),
      )
      .get();

    return { queueId, position: (ahead?.cnt ?? 0) + 1 };
  }

  /** 분석 상태 조회 */
  async getAnalysisStatus(ideaId: string) {
    const item = await this.db
      .select()
      .from(prdAnalysisQueue)
      .where(eq(prdAnalysisQueue.ideaId, ideaId))
      .orderBy(desc(prdAnalysisQueue.requestedAt))
      .get();

    if (!item) return { status: "none" as const };

    if (item.status === AnalysisQueueStatus.PENDING) {
      const ahead = await this.db
        .select({ cnt: sql<number>`COUNT(*)` })
        .from(prdAnalysisQueue)
        .where(
          and(
            eq(prdAnalysisQueue.status, AnalysisQueueStatus.PENDING),
            lt(prdAnalysisQueue.requestedAt, item.requestedAt),
          ),
        )
        .get();

      return {
        status: "PENDING" as const,
        queueId: item.id,
        position: (ahead?.cnt ?? 0) + 1,
        requestedAt: item.requestedAt,
      };
    }

    if (item.status === AnalysisQueueStatus.PROCESSING) {
      return {
        status: "PROCESSING" as const,
        queueId: item.id,
        startedAt: item.startedAt,
      };
    }

    if (item.status === AnalysisQueueStatus.COMPLETED) {
      // PRD 제목 + 리뷰 데이터 fetch
      let prdTitle: string | null = null;
      let reviewData: { verdict: string; totalScore: number; feedbackCount: number } | null = null;

      if (item.prdId) {
        const prd = await this.db.select({ title: prds.title }).from(prds).where(eq(prds.id, item.prdId)).get();
        prdTitle = prd?.title ?? null;

        const review = await this.db
          .select({ verdict: prdReviews.verdict, scorecard: prdReviews.scorecard, feedbackItems: prdReviews.feedbackItems })
          .from(prdReviews)
          .where(eq(prdReviews.prdId, item.prdId))
          .orderBy(desc(prdReviews.createdAt))
          .get();

        if (review?.verdict && review.scorecard) {
          const sc = review.scorecard as ReviewScorecard;
          const fb = (review.feedbackItems ?? []) as ReviewFeedbackItem[];
          reviewData = { verdict: review.verdict, totalScore: sc.totalScore, feedbackCount: fb.length };
        }
      }

      return {
        status: "COMPLETED" as const,
        queueId: item.id,
        prdId: item.prdId,
        prdTitle,
        reviewData,
        completedAt: item.completedAt,
      };
    }

    return {
      status: "FAILED" as const,
      queueId: item.id,
      error: item.errorMessage,
      completedAt: item.completedAt,
    };
  }

  /** PENDING 큐 취소 */
  async cancelAnalysis(ideaId: string, requestedBy: string): Promise<void> {
    const item = await this.db
      .select()
      .from(prdAnalysisQueue)
      .where(eq(prdAnalysisQueue.ideaId, ideaId))
      .orderBy(desc(prdAnalysisQueue.requestedAt))
      .get();

    if (!item) {
      throw new NotFoundError("분석 요청을 찾을 수 없어요.");
    }
    if (item.requestedBy !== requestedBy) {
      throw new ForbiddenError("본인의 분석 요청만 취소할 수 있어요.");
    }
    if (item.status !== AnalysisQueueStatus.PENDING) {
      throw new ConflictError("대기 중인 요청만 취소할 수 있어요.");
    }

    await this.db
      .delete(prdAnalysisQueue)
      .where(eq(prdAnalysisQueue.id, item.id));
  }

  /** 배치 프로세서: 다음 PENDING 큐 가져오기 (PROCESSING 전환) */
  async processNext() {
    const item = await this.db
      .select()
      .from(prdAnalysisQueue)
      .where(eq(prdAnalysisQueue.status, AnalysisQueueStatus.PENDING))
      .orderBy(prdAnalysisQueue.requestedAt)
      .get();

    if (!item) return null;

    await this.db
      .update(prdAnalysisQueue)
      .set({
        status: AnalysisQueueStatus.PROCESSING,
        startedAt: sql`(unixepoch())`,
      })
      .where(eq(prdAnalysisQueue.id, item.id));

    return item;
  }

  /** 배치 프로세서: 분석 완료 처리 (PRD 자동 생성 + 검토 결과 저장) */
  async completeAnalysis(queueId: string, result: {
    title: string;
    sections: Record<string, string>;
    review: {
      verdict: string;
      scorecard: ReviewScorecard;
      feedbackItems: ReviewFeedbackItem[];
    } | null;
    modelVersion?: string;
    tokensUsed?: number;
    latencyMs?: number;
  }): Promise<string> {
    const item = await this.db
      .select()
      .from(prdAnalysisQueue)
      .where(eq(prdAnalysisQueue.id, queueId))
      .get();

    if (!item) throw new NotFoundError("큐 항목을 찾을 수 없어요.");

    // PRD 자동 생성
    const prdId = await this.create({
      tenantId: item.tenantId,
      title: result.title,
      createdBy: item.requestedBy,
      sourceIdeaId: item.ideaId,
    });

    // 8개 섹션 generatedContent 업데이트
    for (const [type, content] of Object.entries(result.sections)) {
      await this.db
        .update(prdSections)
        .set({ generatedContent: content })
        .where(and(eq(prdSections.prdId, prdId), eq(prdSections.type, type)));
    }

    // PRD 상태 → GENERATED
    await this.update(prdId, { status: PrdStatus.GENERATED, interviewProgress: 8 });

    // 검토 결과 저장
    if (result.review) {
      await this.saveReviewResult({
        prdId,
        round: 1,
        model: result.modelVersion ?? "claude-sonnet-4-6",
        verdict: result.review.verdict,
        feedbackItems: result.review.feedbackItems,
        scorecard: result.review.scorecard,
        rawResponse: null,
        prdVersion: 1,
      });

      // PRD 상태 → REVIEWED
      await this.update(prdId, { status: PrdStatus.REVIEWED });
    }

    // 큐 완료 처리
    await this.db
      .update(prdAnalysisQueue)
      .set({
        status: AnalysisQueueStatus.COMPLETED,
        prdId,
        resultSections: result.sections,
        resultReview: result.review,
        modelVersion: result.modelVersion ?? null,
        tokensUsed: result.tokensUsed ?? null,
        latencyMs: result.latencyMs ?? null,
        completedAt: sql`(unixepoch())`,
      })
      .where(eq(prdAnalysisQueue.id, queueId));

    return prdId;
  }

  /** 배치 프로세서: 분석 실패 처리 */
  async failAnalysis(queueId: string, errorMessage: string): Promise<void> {
    await this.db
      .update(prdAnalysisQueue)
      .set({
        status: AnalysisQueueStatus.FAILED,
        errorMessage,
        completedAt: sql`(unixepoch())`,
      })
      .where(eq(prdAnalysisQueue.id, queueId));
  }

  // ────────────── 전략 분석 큐 (Phase 4) ──────────────

  /** 전략 분석 요청 큐에 추가 */
  async enqueueStrategy(input: {
    ideaId: string;
    prdId: string;
    tenantId: string;
    requestedBy: string;
    prdContext: string;
    mode: string;
  }): Promise<{ queueId: string; position: number }> {
    // 이미 PENDING/PROCESSING인 큐 확인
    const existing = await this.db
      .select({ id: prdStrategyQueue.id, status: prdStrategyQueue.status })
      .from(prdStrategyQueue)
      .where(
        and(
          eq(prdStrategyQueue.ideaId, input.ideaId),
          sql`${prdStrategyQueue.status} IN ('PENDING', 'PROCESSING')`,
        ),
      )
      .get();

    if (existing) {
      throw new ConflictError("이미 전략 분석이 진행 중이에요.");
    }

    const queueId = crypto.randomUUID();
    await this.db.insert(prdStrategyQueue).values({
      id: queueId,
      ideaId: input.ideaId,
      prdId: input.prdId,
      tenantId: input.tenantId,
      requestedBy: input.requestedBy,
      prdContext: input.prdContext,
      mode: input.mode,
      status: StrategyQueueStatus.PENDING,
    });

    // 큐 위치 계산
    const ahead = await this.db
      .select({ cnt: sql<number>`COUNT(*)` })
      .from(prdStrategyQueue)
      .where(
        and(
          eq(prdStrategyQueue.status, StrategyQueueStatus.PENDING),
          lt(prdStrategyQueue.requestedAt, sql`(unixepoch())`),
        ),
      )
      .get();

    return { queueId, position: (ahead?.cnt ?? 0) + 1 };
  }

  /** 전략 분석 상태 조회 */
  async getStrategyStatus(ideaId: string) {
    const item = await this.db
      .select()
      .from(prdStrategyQueue)
      .where(eq(prdStrategyQueue.ideaId, ideaId))
      .orderBy(desc(prdStrategyQueue.requestedAt))
      .get();

    if (!item) return { status: "none" as const };

    if (item.status === StrategyQueueStatus.PENDING) {
      const ahead = await this.db
        .select({ cnt: sql<number>`COUNT(*)` })
        .from(prdStrategyQueue)
        .where(
          and(
            eq(prdStrategyQueue.status, StrategyQueueStatus.PENDING),
            lt(prdStrategyQueue.requestedAt, item.requestedAt),
          ),
        )
        .get();

      return {
        status: "PENDING" as const,
        queueId: item.id,
        position: (ahead?.cnt ?? 0) + 1,
        requestedAt: item.requestedAt,
      };
    }

    if (item.status === StrategyQueueStatus.PROCESSING) {
      return {
        status: "PROCESSING" as const,
        queueId: item.id,
        startedAt: item.startedAt,
      };
    }

    if (item.status === StrategyQueueStatus.COMPLETED) {
      const hasStrategy = !!item.resultStrategy;
      const hasGtm = !!item.resultGtm;
      const strategyFrameworks = hasStrategy
        ? Object.keys(item.resultStrategy as unknown as Record<string, unknown>).length
        : 0;

      return {
        status: "COMPLETED" as const,
        queueId: item.id,
        prdId: item.prdId,
        hasStrategy,
        hasGtm,
        strategyFrameworks,
        completedAt: item.completedAt,
      };
    }

    return {
      status: "FAILED" as const,
      queueId: item.id,
      error: item.errorMessage,
      completedAt: item.completedAt,
    };
  }

  /** PENDING 전략 분석 취소 */
  async cancelStrategy(ideaId: string, requestedBy: string): Promise<void> {
    const item = await this.db
      .select()
      .from(prdStrategyQueue)
      .where(eq(prdStrategyQueue.ideaId, ideaId))
      .orderBy(desc(prdStrategyQueue.requestedAt))
      .get();

    if (!item) {
      throw new NotFoundError("전략 분석 요청을 찾을 수 없어요.");
    }
    if (item.requestedBy !== requestedBy) {
      throw new ForbiddenError("본인의 분석 요청만 취소할 수 있어요.");
    }
    if (item.status !== StrategyQueueStatus.PENDING) {
      throw new ConflictError("대기 중인 요청만 취소할 수 있어요.");
    }

    await this.db
      .delete(prdStrategyQueue)
      .where(eq(prdStrategyQueue.id, item.id));
  }

  /** 전략 분석 완료 처리 */
  async completeStrategy(queueId: string, result: {
    strategy: StrategyResult;
    gtm?: GtmResult;
    modelVersion?: string;
    tokensUsed?: number;
    latencyMs?: number;
  }): Promise<void> {
    await this.db
      .update(prdStrategyQueue)
      .set({
        status: StrategyQueueStatus.COMPLETED,
        resultStrategy: result.strategy,
        resultGtm: result.gtm ?? null,
        modelVersion: result.modelVersion ?? null,
        tokensUsed: result.tokensUsed ?? null,
        latencyMs: result.latencyMs ?? null,
        completedAt: sql`(unixepoch())`,
      })
      .where(eq(prdStrategyQueue.id, queueId));
  }

  /** 전략 분석 실패 처리 */
  async failStrategy(queueId: string, errorMessage: string): Promise<void> {
    await this.db
      .update(prdStrategyQueue)
      .set({
        status: StrategyQueueStatus.FAILED,
        errorMessage,
        completedAt: sql`(unixepoch())`,
      })
      .where(eq(prdStrategyQueue.id, queueId));
  }

  /** 전략 분석 결과 조회 (COMPLETED만) */
  async getStrategyResult(ideaId: string) {
    const item = await this.db
      .select({
        id: prdStrategyQueue.id,
        prdId: prdStrategyQueue.prdId,
        resultStrategy: prdStrategyQueue.resultStrategy,
        resultGtm: prdStrategyQueue.resultGtm,
        modelVersion: prdStrategyQueue.modelVersion,
        completedAt: prdStrategyQueue.completedAt,
      })
      .from(prdStrategyQueue)
      .where(
        and(
          eq(prdStrategyQueue.ideaId, ideaId),
          eq(prdStrategyQueue.status, StrategyQueueStatus.COMPLETED),
        ),
      )
      .orderBy(desc(prdStrategyQueue.completedAt))
      .get();

    return item ?? null;
  }
}

// ============================================================================
// Error Classes
// ============================================================================

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForbiddenError";
  }
}
