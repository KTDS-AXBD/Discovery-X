import { z } from "zod";
import type { DB } from "~/db";
import { eq, count, and } from "drizzle-orm";
import { experiments, evidence, discoveries, DiscoveryStatus } from "~/db/schema";

// ============================================================================
// Validation Error
// ============================================================================

export class ValidationError extends Error {
  constructor(
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

export type ValidationResult = {
  valid: boolean;
  warning?: string;
};

// ============================================================================
// Discovery Validation Rules (PRD §5.1)
// ============================================================================

export class DiscoveryValidationRules {
  /**
   * Rule 1: Owner 필수 (OPEN/NEXT/NOT_NOW/DEAD_END 상태 전환 시)
   * PRD §5.1: Owner 없이는 OPEN 상태로 전환 불가
   */
  static validateOwnerRequired(ownerId: string | null | undefined): void {
    if (!ownerId) {
      throw new ValidationError(
        "Owner를 지정해야 OPEN 상태로 전환할 수 있습니다.",
        { field: "ownerId", rule: "owner_required" }
      );
    }
  }

  /**
   * Rule 2: Experiment 최대 2개 제한
   * PRD §5.1: Discovery당 최대 2개 실험만 허용
   * 3번째 시도 시 EXTENSION_REQUESTED 상태로 전환 필요
   */
  static async validateExperimentLimit(
    db: DB,
    discoveryId: string
  ): Promise<ValidationResult> {
    const result = await db
      .select({ count: count() })
      .from(experiments)
      .where(eq(experiments.discoveryId, discoveryId));

    const experimentCount = result[0]?.count || 0;

    if (experimentCount >= 2) {
      throw new ValidationError(
        "Discovery당 최대 2개 실험만 가능합니다. 3번째 실험은 Reviewer 승인이 필요합니다.",
        {
          currentCount: experimentCount,
          suggestedAction: "EXTENSION_REQUESTED",
        }
      );
    }

    return { valid: true };
  }

  /**
   * Rule 3: NOT_NOW 필수 필드 검증
   * PRD §5.1: triggerType, triggerCondition, revisitDate 모두 필수
   */
  static validateNotNowDecision(data: {
    notNowTriggerType?: string | null;
    notNowTriggerCondition?: string | null;
    revisitDate?: Date | null;
  }): void {
    if (
      !data.notNowTriggerType ||
      !data.notNowTriggerCondition ||
      !data.revisitDate
    ) {
      throw new ValidationError(
        "NOT_NOW 결정은 트리거 유형, 조건, 재검토 날짜가 모두 필수입니다.",
        {
          missing: {
            triggerType: !data.notNowTriggerType,
            triggerCondition: !data.notNowTriggerCondition,
            revisitDate: !data.revisitDate,
          },
        }
      );
    }

    // revisitDate는 미래 날짜여야 함
    if (data.revisitDate && data.revisitDate <= new Date()) {
      throw new ValidationError("재검토 날짜는 미래 날짜여야 합니다.", {
        revisitDate: data.revisitDate,
      });
    }
  }

  /**
   * Rule 4: DEAD_END 필수 필드 검증
   * PRD §5.1: failurePattern (1-3개), evidenceReason 필수
   */
  static validateDeadEndDecision(data: {
    deadEndFailurePattern?: string[] | null;
    deadEndEvidenceReason?: string | null;
  }): void {
    if (
      !data.deadEndFailurePattern ||
      data.deadEndFailurePattern.length === 0
    ) {
      throw new ValidationError(
        "DEAD_END는 최소 1개의 실패 패턴 태그가 필요합니다.",
        { field: "deadEndFailurePattern" }
      );
    }

    if (data.deadEndFailurePattern.length > 3) {
      throw new ValidationError("실패 패턴은 최대 3개까지 선택 가능합니다.", {
        count: data.deadEndFailurePattern.length,
      });
    }

    if (!data.deadEndEvidenceReason?.trim()) {
      throw new ValidationError("DEAD_END는 증거 기반 사유가 필수입니다.", {
        field: "deadEndEvidenceReason",
      });
    }
  }

  /**
   * Rule 5: NEXT 결정 시 강한 증거 권장
   * PRD §5.1: A/B급 증거 최소 2개 권장 (경고만 표시)
   */
  static async validateNextDecision(
    db: DB,
    discoveryId: string
  ): Promise<ValidationResult> {
    const result = await db
      .select({ count: count() })
      .from(evidence)
      .where(
        and(
          eq(evidence.discoveryId, discoveryId),
          // SQLite에서는 IN 조건을 OR로 처리
          // strength = 'A' OR strength = 'B'
        )
      );

    // A/B급 증거 개수 계산
    const allEvidence = await db
      .select()
      .from(evidence)
      .where(eq(evidence.discoveryId, discoveryId));

    const strongEvidence = allEvidence.filter(
      (e) => e.strength === "A" || e.strength === "B"
    );

    if (strongEvidence.length < 2) {
      return {
        valid: true,
        warning: `강한 증거(A/B급)가 ${strongEvidence.length}개뿐입니다. 최소 2개 권장합니다.`,
      };
    }

    return { valid: true };
  }

  /**
   * Rule 6: 28일 Time-box 자동 설정
   * PRD §5.1: OPEN 전환 시 createdAt + 28일
   */
  static calculateDueDate(createdAt: Date): Date {
    const dueDate = new Date(createdAt);
    dueDate.setDate(dueDate.getDate() + 28);
    return dueDate;
  }

  /**
   * Rule 7: Extension 승인 시 +14일 연장
   */
  static calculateExtensionDueDate(currentDueDate: Date): Date {
    const newDueDate = new Date(currentDueDate);
    newDueDate.setDate(newDueDate.getDate() + 14);
    return newDueDate;
  }
}

// ============================================================================
// Zod Schemas for Input Validation
// ============================================================================

export const CreateDiscoverySchema = z.object({
  title: z.string().min(1, "제목은 필수입니다").max(80, "제목은 80자 이내여야 합니다"),
  seedSummary: z
    .string()
    .min(1, "요약은 필수입니다")
    .max(400, "요약은 400자 이내여야 합니다"),
  seedLinks: z.array(z.string().url()).optional(),
  sourceType: z.enum([
    "article",
    "issue",
    "internal_pain",
    "meeting_note",
    "other",
  ]),
});

export const PromoteToOpenSchema = z.object({
  ownerId: z.string().min(1, "Owner를 지정해야 합니다"),
  firstExperiment: z.object({
    hypothesis: z
      .string()
      .min(1, "가설은 필수입니다")
      .max(200, "가설은 200자 이내여야 합니다"),
    minimalAction: z
      .string()
      .min(1, "최소 행동은 필수입니다")
      .max(200, "최소 행동은 200자 이내여야 합니다"),
    deadline: z.date(),
    expectedEvidence: z
      .string()
      .min(1, "예상 근거는 필수입니다")
      .max(200, "예상 근거는 200자 이내여야 합니다"),
  }),
});

export const NotNowDecisionSchema = z.object({
  decisionRationale: z
    .string()
    .min(1, "결정 근거는 필수입니다")
    .max(400, "결정 근거는 400자 이내여야 합니다"),
  notNowTriggerType: z.enum([
    "Technology_Maturity",
    "Policy_Regulation",
    "Customer_Behavior",
    "Internal_Capability",
  ]),
  notNowTriggerCondition: z
    .string()
    .min(1, "트리거 조건은 필수입니다")
    .max(200, "트리거 조건은 200자 이내여야 합니다"),
  revisitDate: z.date().refine((date) => date > new Date(), {
    message: "재검토 날짜는 미래 날짜여야 합니다",
  }),
});

export const DeadEndDecisionSchema = z.object({
  decisionRationale: z
    .string()
    .min(1, "결정 근거는 필수입니다")
    .max(400, "결정 근거는 400자 이내여야 합니다"),
  deadEndFailurePattern: z
    .array(z.string())
    .min(1, "최소 1개의 실패 패턴을 선택해야 합니다")
    .max(3, "최대 3개의 실패 패턴만 선택 가능합니다"),
  deadEndEvidenceReason: z
    .string()
    .min(1, "증거 기반 사유는 필수입니다")
    .max(200, "증거 기반 사유는 200자 이내여야 합니다"),
});

export const NextDecisionSchema = z.object({
  decisionRationale: z
    .string()
    .min(1, "결정 근거는 필수입니다")
    .max(400, "결정 근거는 400자 이내여야 합니다"),
});

export const ExtensionRequestedSchema = z.object({
  extensionRationale: z
    .string()
    .min(1, "연장 사유는 필수입니다")
    .max(400, "연장 사유는 400자 이내여야 합니다"),
});

export const CreateExperimentSchema = z.object({
  hypothesis: z
    .string()
    .min(1, "가설은 필수입니다")
    .max(200, "가설은 200자 이내여야 합니다"),
  minimalAction: z
    .string()
    .min(1, "최소 행동은 필수입니다")
    .max(200, "최소 행동은 200자 이내여야 합니다"),
  deadline: z.date(),
  expectedEvidence: z
    .string()
    .min(1, "예상 근거는 필수입니다")
    .max(200, "예상 근거는 200자 이내여야 합니다"),
});

export const CompleteExperimentSchema = z.object({
  resultSummary: z
    .string()
    .min(1, "결과 요약은 필수입니다")
    .max(400, "결과 요약은 400자 이내여야 합니다"),
});

export const CreateEvidenceSchema = z.object({
  type: z.enum(["DATA", "USER", "ARTIFACT", "REF", "ASSUMPTION"]),
  strength: z.enum(["A", "B", "C", "D"]),
  content: z
    .string()
    .min(1, "내용은 필수입니다")
    .max(400, "내용은 400자 이내여야 합니다"),
  linkOrAttachment: z.string().url().optional(),
  experimentId: z.string().optional(),
});
