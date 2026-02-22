// ============================================================================
// STATUS MODEL — 5-stage pipeline
// ============================================================================

export const PROPOSAL_STATUS_LABELS: Record<string, string> = {
  PROPOSAL: "사업제안",
  FORMALIZATION: "형상화",
  VALIDATION: "검증",
  COMPLETED: "완료(제품화/GTM)",
  CLOSED: "종료(Hold/Drop)",
};

export const PROPOSAL_STATUS_VARIANTS: Record<string, "warning" | "success" | "destructive" | "secondary" | "default"> = {
  PROPOSAL: "secondary",
  FORMALIZATION: "warning",
  VALIDATION: "default",
  COMPLETED: "success",
  CLOSED: "destructive",
};

export const PROPOSAL_STATUS_COLORS: Record<string, string> = {
  PROPOSAL: "bg-surface-secondary text-[var(--axis-badge-secondary-text,#374151)]",
  FORMALIZATION: "bg-badge-warning-bg text-badge-warning-text",
  VALIDATION: "bg-blue-100 text-blue-800",
  COMPLETED: "bg-badge-success-bg text-badge-success-text",
  CLOSED: "bg-badge-destructive-bg text-badge-destructive-text",
};

// ============================================================================
// STATUS TRANSITIONS
// ============================================================================

export const PROPOSAL_TRANSITIONS: Record<string, string[]> = {
  PROPOSAL: ["FORMALIZATION", "CLOSED"],
  FORMALIZATION: ["VALIDATION", "PROPOSAL", "CLOSED"],
  VALIDATION: ["COMPLETED", "FORMALIZATION", "CLOSED"],
  COMPLETED: ["CLOSED"],
  CLOSED: ["PROPOSAL"],
};

/** Forward (primary) transitions — the single main "advance" action */
export const PROPOSAL_FORWARD_TRANSITIONS: Record<string, { target: string; label: string } | null> = {
  PROPOSAL: { target: "FORMALIZATION", label: "형상화로 이동" },
  FORMALIZATION: { target: "VALIDATION", label: "검증으로 이동" },
  VALIDATION: { target: "COMPLETED", label: "완료 처리" },
  COMPLETED: null,
  CLOSED: { target: "PROPOSAL", label: "다시 제안으로" },
};

export function validateProposalTransition(from: string, to: string): boolean {
  const allowed = PROPOSAL_TRANSITIONS[from];
  return !!allowed && allowed.includes(to);
}

// ============================================================================
// CLOSE TYPE
// ============================================================================

export const CLOSE_TYPE_LABELS: Record<string, string> = {
  HOLD: "보류",
  DROP: "폐기",
};

// ============================================================================
// SECTION CONFIG — 10 sections in 7 groups
// ============================================================================

export const SECTION_CONFIG = [
  // Group: 사업 개요
  { type: "overview", label: "사업 개요", group: "사업 개요", icon: "1", placeholder: "사업의 핵심 아이디어를 한 문장으로..." },
  { type: "content", label: "사업 내용", group: "사업 개요", icon: "2", placeholder: "구체적인 사업 내용, 서비스/제품 설명..." },
  { type: "hypothesis", label: "핵심 가설", group: "사업 개요", icon: "3", placeholder: "이 사업이 성공하기 위해 참이어야 하는 핵심 가설..." },
  // Group: 타겟
  { type: "target_market", label: "타겟 시장", group: "타겟", icon: "4", placeholder: "시장 규모, 성장률, 진입 기회..." },
  { type: "target_customer", label: "타겟 고객", group: "타겟", icon: "5", placeholder: "타겟 고객 세그먼트, 페인포인트..." },
  // Group: 가치 제안
  { type: "value_proposition", label: "가치 제안", group: "가치 제안", icon: "6", placeholder: "핵심 차별점, 진입장벽, 경쟁 우위..." },
  // Group: 수익 구조
  { type: "revenue_model", label: "수익 구조", group: "수익 구조", icon: "7", placeholder: "수익 모델, 가격 전략, 과금 체계..." },
  // Group: 시나리오
  { type: "scenario", label: "시나리오", group: "시나리오", icon: "8", placeholder: "예상 매출, 비용 구조, BEP, 3개년 추정..." },
  // Group: MVP
  { type: "mvp", label: "MVP 정의", group: "MVP", icon: "9", placeholder: "최소 기능 제품(MVP) 범위, 핵심 기능..." },
  // Group: 실행 방안
  { type: "execution_plan", label: "실행 방안", group: "실행 방안", icon: "10", placeholder: "일정, 리소스, 팀 구성, 핵심 마일스톤..." },
] as const;

export const SECTION_GROUPS = [
  { name: "사업 개요", types: ["overview", "content", "hypothesis"] },
  { name: "타겟", types: ["target_market", "target_customer"] },
  { name: "가치 제안", types: ["value_proposition"] },
  { name: "수익 구조", types: ["revenue_model"] },
  { name: "시나리오", types: ["scenario"] },
  { name: "MVP", types: ["mvp"] },
  { name: "실행 방안", types: ["execution_plan"] },
] as const;

export const SECTION_ICONS: Record<string, string> = Object.fromEntries(
  SECTION_CONFIG.map(s => [s.type, s.icon])
);

export const SECTION_LABELS: Record<string, string> = Object.fromEntries(
  SECTION_CONFIG.map(s => [s.type, s.label])
);

// ============================================================================
// LEGACY SECTION MAPPING (old 5-type → new 10-type)
// ============================================================================

export const LEGACY_SECTION_MAPPING: Record<string, string> = {
  market: "target_market",
  target: "target_customer",
  model: "revenue_model",
  advantage: "value_proposition",
  finance: "scenario",
};

/** All valid section types (new + legacy) */
export function resolveSection(type: string): string {
  return LEGACY_SECTION_MAPPING[type] || type;
}

// ============================================================================
// DELAY TRACKING
// ============================================================================

/** Days threshold for considering a proposal "delayed" */
export const DELAY_THRESHOLDS: Record<string, number> = {
  PROPOSAL: 7,
  FORMALIZATION: 14,
  VALIDATION: 21,
};

// ============================================================================
// PIPELINE TABS
// ============================================================================

export const PROPOSAL_TABS = [
  { id: "overview", label: "제안 현황", path: "/proposals" },
  { id: "new", label: "신규 제안", path: "/proposals/new" },
  { id: "formalization", label: "형상화", path: "/proposals/formalization" },
  { id: "validation", label: "검증", path: "/proposals/validation" },
  { id: "completed", label: "완료/종료", path: "/proposals/completed" },
] as const;
