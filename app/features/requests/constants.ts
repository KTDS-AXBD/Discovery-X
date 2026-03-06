/**
 * 요구사항 도메인 상수
 * Bounded Context: requests
 */

/** 요구사항 상태 (기존 4 + 신규 2) */
export const RequestStatus = {
  OPEN: "OPEN",
  AI_REVIEWING: "AI_REVIEWING",
  CLASSIFIED: "CLASSIFIED",
  HUMAN_REVIEW: "HUMAN_REVIEW",
  ACCEPTED: "ACCEPTED",
  REJECTED: "REJECTED",
} as const;
export type RequestStatusValue = (typeof RequestStatus)[keyof typeof RequestStatus];

/** 기존 호환용: 원래 4개 상태 */
export const LEGACY_STATUSES = ["OPEN", "IN_REVIEW", "ACCEPTED", "REJECTED"] as const;

/** AI 분류 결과 */
export const RequestClassification = {
  ALREADY_DONE: "ALREADY_DONE",
  IN_PLAN: "IN_PLAN",
  NEW_VALUABLE: "NEW_VALUABLE",
  OUT_OF_SCOPE: "OUT_OF_SCOPE",
} as const;
export type RequestClassificationValue = (typeof RequestClassification)[keyof typeof RequestClassification];

/** 사람 판정 */
export const HumanVerdict = {
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  NEEDS_REVISION: "NEEDS_REVISION",
} as const;
export type HumanVerdictValue = (typeof HumanVerdict)[keyof typeof HumanVerdict];

/** 작업계획 상태 */
export const WorkPlanStatus = {
  DRAFT: "DRAFT",
  APPROVED: "APPROVED",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
} as const;
export type WorkPlanStatusValue = (typeof WorkPlanStatus)[keyof typeof WorkPlanStatus];

/** 우선순위 */
export const RequestPriority = {
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
} as const;
export type RequestPriorityValue = (typeof RequestPriority)[keyof typeof RequestPriority];

/** 이벤트 유형 */
export const RequestEventType = {
  CREATED: "created",
  STATUS_CHANGED: "status_changed",
  AI_REVIEW_STARTED: "ai_review_started",
  AI_REVIEW_COMPLETED: "ai_review_completed",
  HUMAN_VERDICT: "human_verdict",
  WORK_PLAN_CREATED: "work_plan_created",
  DISCOVERY_LINKED: "discovery_linked",
} as const;

/** 허용된 상태 전환 규칙 */
export const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  OPEN: ["AI_REVIEWING"],
  AI_REVIEWING: ["CLASSIFIED"],
  CLASSIFIED: ["HUMAN_REVIEW"],
  HUMAN_REVIEW: ["ACCEPTED", "REJECTED", "CLASSIFIED"],
  ACCEPTED: [],
  REJECTED: ["OPEN"],
};

/** 분류 라벨 (한국어) */
export const CLASSIFICATION_LABELS: Record<string, string> = {
  ALREADY_DONE: "이미 구현됨",
  IN_PLAN: "계획에 포함",
  NEW_VALUABLE: "신규 가치",
  OUT_OF_SCOPE: "범위 밖",
};

/** 상태 라벨 (한국어) */
export const STATUS_LABELS: Record<string, string> = {
  OPEN: "접수",
  AI_REVIEWING: "AI 검토 중",
  CLASSIFIED: "분류 완료",
  HUMAN_REVIEW: "사람 검토",
  ACCEPTED: "반영",
  REJECTED: "보류",
};
