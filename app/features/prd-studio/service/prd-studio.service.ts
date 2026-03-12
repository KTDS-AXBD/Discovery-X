import { eq, desc, and, sql, count } from "drizzle-orm";
import type { DB } from "~/db";
import {
  prds,
  prdSections,
  prdVersions,
  prdReviews,
  prdEvents,
  PrdSectionType,
  PrdStatus,
} from "~/features/prd-studio/db/schema";
import type {
  CreatePrdInput,
  UpdatePrdInput,
  PrdVersionSnapshot,
  ReviewFeedbackItem,
  ReviewScorecard,
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

  /** PRD 생성 + 8개 빈 섹션 자동 생성 — 생성된 ID 반환 */
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

    // 8개 섹션 자동 생성
    for (const type of ALL_SECTION_TYPES) {
      await this.db.insert(prdSections).values({
        id: crypto.randomUUID(),
        prdId: id,
        type,
        sortOrder: SECTION_SORT_ORDER[type] ?? 0,
      });
    }

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

  /** 인터뷰 답변 저장 + interviewProgress 갱신 */
  async saveSectionAnswer(prdId: string, sectionType: string, answer: string) {
    // 섹션 답변 저장
    await this.db
      .update(prdSections)
      .set({ interviewAnswer: answer })
      .where(
        and(eq(prdSections.prdId, prdId), eq(prdSections.type, sectionType)),
      );

    // 완료된 섹션 수 계산 → interviewProgress 갱신
    const [result] = await this.db
      .select({ filled: count() })
      .from(prdSections)
      .where(
        and(
          eq(prdSections.prdId, prdId),
          sql`${prdSections.interviewAnswer} != ''`,
        ),
      );

    await this.db
      .update(prds)
      .set({
        interviewProgress: result?.filled ?? 0,
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
}
