import type { BadgeProps } from "~/components/ui/Badge";

export const STAGE_CATEGORIES = {
  ideation: { label: "Ideation", color: "var(--axis-chart-bar)" },
  validation: { label: "Validation", color: "var(--axis-badge-purple-text)" },
  execution: { label: "Execution", color: "var(--axis-badge-success-text)" },
  terminal: { label: "Terminal", color: "var(--axis-text-tertiary)" },
} as const;

export const STATUS_CONFIG: Record<string, {
  label: string;
  variant: BadgeProps["variant"];
  category: keyof typeof STAGE_CATEGORIES;
  order: number;
}> = {
  // Ideation
  DISCOVERY: { label: "발견", variant: "secondary", category: "ideation", order: 1 },
  IDEA_CARD: { label: "아이디어", variant: "info", category: "ideation", order: 2 },
  // Validation
  HYPOTHESIS: { label: "가설", variant: "purple", category: "validation", order: 3 },
  EXPERIMENT: { label: "실험", variant: "warning", category: "validation", order: 4 },
  EVIDENCE_REVIEW: { label: "근거 검토", variant: "success", category: "validation", order: 5 },
  // Execution
  GATE1: { label: "Gate 1", variant: "destructive", category: "execution", order: 6 },
  SPRINT: { label: "스프린트", variant: "warning", category: "execution", order: 7 },
  GATE2: { label: "Gate 2", variant: "destructive", category: "execution", order: 8 },
  HANDOFF: { label: "핸드오프", variant: "success", category: "execution", order: 9 },
  // Terminal
  HOLD: { label: "보류", variant: "secondary", category: "terminal", order: 10 },
  DROP: { label: "중단", variant: "destructive", category: "terminal", order: 11 },
};

/**
 * 11단계 파이프라인 컬럼 정의 (대시보드용)
 */
export const PIPELINE_COLUMNS = [
  { status: "DISCOVERY", label: "발견", category: "ideation" },
  { status: "IDEA_CARD", label: "아이디어", category: "ideation" },
  { status: "HYPOTHESIS", label: "가설", category: "validation" },
  { status: "EXPERIMENT", label: "실험", category: "validation" },
  { status: "EVIDENCE_REVIEW", label: "근거 검토", category: "validation" },
  { status: "GATE1", label: "Gate 1", category: "execution" },
  { status: "SPRINT", label: "스프린트", category: "execution" },
  { status: "GATE2", label: "Gate 2", category: "execution" },
  { status: "HANDOFF", label: "핸드오프", category: "execution" },
  { status: "HOLD", label: "보류", category: "terminal" },
  { status: "DROP", label: "중단", category: "terminal" },
] as const;

/**
 * 허용된 상태 전환 맵 (from → to[])
 */
export const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  DISCOVERY: ["IDEA_CARD", "HOLD", "DROP"],
  IDEA_CARD: ["HYPOTHESIS", "HOLD", "DROP"],
  HYPOTHESIS: ["EXPERIMENT", "HOLD", "DROP"],
  EXPERIMENT: ["EVIDENCE_REVIEW", "HYPOTHESIS", "HOLD", "DROP"],
  EVIDENCE_REVIEW: ["GATE1", "HYPOTHESIS", "HOLD", "DROP"],
  GATE1: ["SPRINT", "HOLD", "DROP"],
  SPRINT: ["GATE2", "HOLD", "DROP"],
  GATE2: ["HANDOFF", "SPRINT", "HOLD", "DROP"],
  HANDOFF: [],
  HOLD: ["DISCOVERY", "IDEA_CARD", "HYPOTHESIS", "EXPERIMENT", "DROP"],
  DROP: [],
};

/**
 * 모든 유효한 상태값 배열
 */
export const ALL_STATUSES = Object.keys(STATUS_CONFIG);
