import { z } from "zod";
import type { DB } from "~/db";
import { eq, count } from "drizzle-orm";
import { experiments, evidence } from "~/db/schema";
import { ALLOWED_TRANSITIONS } from "~/lib/constants/status";

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
// Discovery Validation Rules (11단계 파이프라인)
// ============================================================================

export class DiscoveryValidationRules {
  /**
   * 상태 전환 유효성 검사
   */
  static validateTransition(fromStatus: string, toStatus: string): void {
    const allowed = ALLOWED_TRANSITIONS[fromStatus];
    if (!allowed) {
      throw new ValidationError(
        `알 수 없는 상태입니다: ${fromStatus}`,
        { fromStatus, rule: "unknown_status" }
      );
    }
    if (!allowed.includes(toStatus)) {
      throw new ValidationError(
        `${fromStatus}에서 ${toStatus}로 전환할 수 없습니다. 허용된 전환: ${allowed.join(", ")}`,
        { fromStatus, toStatus, allowed, rule: "invalid_transition" }
      );
    }
  }

  /**
   * Rule 1: Owner 필수 (IDEA_CARD 이후 단계 전환 시)
   */
  static validateOwnerRequired(ownerId: string | null | undefined): void {
    if (!ownerId) {
      throw new ValidationError(
        "Owner를 지정해야 IDEA_CARD 상태로 전환할 수 있습니다.",
        { field: "ownerId", rule: "owner_required" }
      );
    }
  }

  /**
   * Rule 2: Experiment 최대 2개 제한
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
          suggestedAction: "request_extension",
        }
      );
    }

    return { valid: true };
  }

  /**
   * Rule 3: HOLD 필수 필드 검증 (구 NOT_NOW)
   */
  static validateHoldDecision(data: {
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
        "HOLD 결정은 트리거 유형, 조건, 재검토 날짜가 모두 필수입니다.",
        {
          missing: {
            triggerType: !data.notNowTriggerType,
            triggerCondition: !data.notNowTriggerCondition,
            revisitDate: !data.revisitDate,
          },
        }
      );
    }

    if (data.revisitDate && data.revisitDate <= new Date()) {
      throw new ValidationError("재검토 날짜는 미래 날짜여야 합니다.", {
        revisitDate: data.revisitDate,
      });
    }
  }

  /**
   * Rule 4: DROP 필수 필드 검증 (구 DEAD_END)
   */
  static validateDropDecision(data: {
    deadEndFailurePattern?: string[] | null;
    deadEndEvidenceReason?: string | null;
  }): void {
    if (
      !data.deadEndFailurePattern ||
      data.deadEndFailurePattern.length === 0
    ) {
      throw new ValidationError(
        "DROP은 최소 1개의 실패 패턴 태그가 필요합니다.",
        { field: "deadEndFailurePattern" }
      );
    }

    if (data.deadEndFailurePattern.length > 3) {
      throw new ValidationError("실패 패턴은 최대 3개까지 선택 가능합니다.", {
        count: data.deadEndFailurePattern.length,
      });
    }

    if (!data.deadEndEvidenceReason?.trim()) {
      throw new ValidationError("DROP은 증거 기반 사유가 필수입니다.", {
        field: "deadEndEvidenceReason",
      });
    }
  }

  /**
   * Rule 5: Gate 통과 시 강한 증거 권장
   */
  static async validateGateDecision(
    db: DB,
    discoveryId: string
  ): Promise<ValidationResult> {
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
   * Rule 8: Reviewer 필수 (결정 제출 시)
   */
  static validateReviewerRequired(reviewerId: string | null | undefined): void {
    if (!reviewerId) {
      throw new ValidationError(
        "Reviewer가 지정되어야 결정을 제출할 수 있습니다. Discovery 상세 페이지에서 Reviewer를 먼저 지정해주세요.",
        { field: "reviewerId", rule: "reviewer_required" }
      );
    }
  }

  /**
   * Rule 9: 승인 대기 중 중복 제출 차단
   */
  static validateNoApprovalPending(approvalStatus: string): void {
    if (approvalStatus === "PENDING") {
      throw new ValidationError(
        "이미 승인 대기 중인 결정이 있습니다. Reviewer의 승인/거부를 기다려주세요.",
        { rule: "no_duplicate_approval" }
      );
    }
  }

  /**
   * Rule 6: 28일 Time-box 자동 설정
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

  // Legacy aliases
  static validateNotNowDecision = DiscoveryValidationRules.validateHoldDecision;
  static validateDeadEndDecision = DiscoveryValidationRules.validateDropDecision;
  static validateNextDecision = DiscoveryValidationRules.validateGateDecision;

  // ============================================================================
  // Evidence Validator Rules (v3 기획서 §4)
  // ============================================================================

  /**
   * 근거 저장 전 유효성 검사
   * - reliability_label 없으면 저장 차단
   * - source_url 또는 linkOrAttachment 중 하나 필수
   * - summary(content) 200자 미만이면 경고
   */
  static validateEvidenceForSave(data: {
    reliabilityLabel?: string | null;
    sourceUrl?: string | null;
    linkOrAttachment?: string | null;
    content: string;
  }): ValidationResult {
    if (!data.reliabilityLabel) {
      throw new ValidationError(
        "근거의 신뢰도 라벨(reliability_label)은 필수입니다. confirmed/reported/hypothesis 중 선택하세요.",
        { field: "reliabilityLabel", rule: "evidence_reliability_required" }
      );
    }

    const validLabels = ["confirmed", "reported", "hypothesis"];
    if (!validLabels.includes(data.reliabilityLabel)) {
      throw new ValidationError(
        `잘못된 신뢰도 라벨: ${data.reliabilityLabel}. confirmed/reported/hypothesis 중 선택하세요.`,
        { field: "reliabilityLabel", rule: "evidence_reliability_invalid" }
      );
    }

    if (!data.sourceUrl && !data.linkOrAttachment) {
      throw new ValidationError(
        "근거의 출처 URL(source_url) 또는 첨부(linkOrAttachment) 중 하나는 필수입니다.",
        { rule: "evidence_source_required" }
      );
    }

    if (data.content.length < 200) {
      return {
        valid: true,
        warning: `근거 내용이 ${data.content.length}자입니다. 200자 이상 작성을 권장합니다.`,
      };
    }

    return { valid: true };
  }

  /**
   * Gate 통과 전 근거 검증
   * - published_or_observed_date 없으면 Gate 통과 불가
   */
  static async validateEvidenceForGate(
    db: DB,
    discoveryId: string
  ): Promise<ValidationResult> {
    const allEvidence = await db
      .select()
      .from(evidence)
      .where(eq(evidence.discoveryId, discoveryId));

    const missingDate = allEvidence.filter(
      (e) => !e.publishedOrObservedDate
    );

    if (missingDate.length > 0) {
      return {
        valid: true,
        warning: `${missingDate.length}개 근거에 발행/관측일이 없습니다. Gate 통과를 위해 추가를 권장합니다.`,
      };
    }

    return { valid: true };
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

export const ApprovalDecisionSchema = z.object({
  action: z.enum(["approve", "reject"]),
  comment: z
    .string()
    .max(400, "코멘트는 400자 이내여야 합니다")
    .optional(),
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
  reliabilityLabel: z.enum(["confirmed", "reported", "hypothesis"]).optional().default("reported"),
  sourceUrl: z.string().url().optional(),
  publishedOrObservedDate: z.string().optional(),
});
