/**
 * 요구사항 도메인 상수
 * Bounded Context: requests
 */

/** 요구사항 상태 (AI 검토 + 표준 개발 라이프사이클 통합) */
export const RequestStatus = {
  // AI 검토 파이프라인
  OPEN: "OPEN",
  AI_REVIEWING: "AI_REVIEWING",
  CLASSIFIED: "CLASSIFIED",
  HUMAN_REVIEW: "HUMAN_REVIEW",
  ACCEPTED: "ACCEPTED",
  REJECTED: "REJECTED",
  // 표준 개발 라이프사이클 (ACCEPTED 이후)
  PLANNED: "PLANNED",
  IN_PROGRESS: "IN_PROGRESS",
  DONE: "DONE",
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

/** 작업 단계 상태 */
export const StepStatus = {
  TODO: "todo",
  DOING: "doing",
  DONE: "done",
  BLOCKED: "blocked",
} as const;
export type StepStatusValue = (typeof StepStatus)[keyof typeof StepStatus];

/** Agent 실행 상태 */
export const RunStatus = {
  PENDING: "pending",
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
} as const;
export type RunStatusValue = (typeof RunStatus)[keyof typeof RunStatus];

/** 우선순위 (레거시) */
export const RequestPriority = {
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
} as const;
export type RequestPriorityValue = (typeof RequestPriority)[keyof typeof RequestPriority];

/** 표준 우선순위 (영향도 x 긴급도 매트릭스) */
export const PriorityLevel = {
  P0: "P0",
  P1: "P1",
  P2: "P2",
  P3: "P3",
} as const;
export type PriorityLevelValue = (typeof PriorityLevel)[keyof typeof PriorityLevel];

/** 요구사항 유형 (표준 분류) */
export const RequestType = {
  FEATURE: "feature",
  BUG: "bug",
  IMPROVEMENT: "improvement",
  CHORE: "chore",
} as const;
export type RequestTypeValue = (typeof RequestType)[keyof typeof RequestType];

/** 요구사항 도메인 (표준 분류) */
export const RequestDomain = {
  DISCOVERY: "discovery",
  IDEAS: "ideas",
  PROPOSALS: "proposals",
  LAB: "lab",
  AGENT: "agent",
  INFRA: "infra",
} as const;
export type RequestDomainValue = (typeof RequestDomain)[keyof typeof RequestDomain];

/** 영향도 x 긴급도 → P-level 매핑 */
export function computePriorityLevel(impact?: string | null, urgency?: string | null): PriorityLevelValue | null {
  if (!impact || !urgency) return null;
  if (impact === "high" && urgency === "high") return PriorityLevel.P0;
  if (impact === "high" && urgency === "low") return PriorityLevel.P1;
  if (impact === "low" && urgency === "high") return PriorityLevel.P2;
  return PriorityLevel.P3;
}

/** 이벤트 유형 */
export const RequestEventType = {
  CREATED: "created",
  STATUS_CHANGED: "status_changed",
  AI_REVIEW_STARTED: "ai_review_started",
  AI_REVIEW_COMPLETED: "ai_review_completed",
  HUMAN_VERDICT: "human_verdict",
  WORK_PLAN_CREATED: "work_plan_created",
  WORK_PLAN_STEP_STARTED: "work_plan_step_started",
  WORK_PLAN_STEP_COMPLETED: "work_plan_step_completed",
  AGENT_RUN_STARTED: "agent_run_started",
  AGENT_RUN_COMPLETED: "agent_run_completed",
  DISCOVERY_LINKED: "discovery_linked",
  // 표준 라이프사이클 이벤트
  TRIAGED: "triaged",
  PLANNED: "planned",
  SPEC_LINKED: "spec_linked",
} as const;

/** 허용된 상태 전환 규칙 */
export const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  // AI 검토 파이프라인
  OPEN: ["AI_REVIEWING"],
  AI_REVIEWING: ["CLASSIFIED"],
  CLASSIFIED: ["HUMAN_REVIEW", "REJECTED"],
  HUMAN_REVIEW: ["ACCEPTED", "REJECTED", "CLASSIFIED"],
  // 표준 개발 라이프사이클
  ACCEPTED: ["PLANNED"],
  PLANNED: ["IN_PROGRESS", "REJECTED"],
  IN_PROGRESS: ["DONE", "PLANNED"],
  DONE: [],
  // 보류에서 재오픈
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
  HUMAN_REVIEW: "담당자 검토",
  ACCEPTED: "반영",
  REJECTED: "보류",
  PLANNED: "계획",
  IN_PROGRESS: "진행 중",
  DONE: "완료",
};

/** 유형 라벨 (한국어) */
export const TYPE_LABELS: Record<string, string> = {
  feature: "기능",
  bug: "버그",
  improvement: "개선",
  chore: "인프라",
};

/** 도메인 라벨 (한국어) */
export const DOMAIN_LABELS: Record<string, string> = {
  discovery: "Discovery",
  ideas: "아이디어",
  proposals: "사업제안",
  lab: "실험실",
  agent: "Agent",
  infra: "인프라",
};

/** P-level 라벨 */
export const PRIORITY_LEVEL_LABELS: Record<string, string> = {
  P0: "P0 — 즉시",
  P1: "P1 — 이번 마일스톤",
  P2: "P2 — 다음 마일스톤",
  P3: "P3 — 백로그",
};

/** 작업계획 상태 라벨 */
export const WORK_PLAN_STATUS_LABELS: Record<string, string> = {
  DRAFT: "초안",
  APPROVED: "승인",
  IN_PROGRESS: "진행 중",
  COMPLETED: "완료",
  CANCELLED: "취소",
};

/** 단계 상태 라벨 */
export const STEP_STATUS_LABELS: Record<string, string> = {
  todo: "대기",
  doing: "진행 중",
  done: "완료",
  blocked: "차단",
};
