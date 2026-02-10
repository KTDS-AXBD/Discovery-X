export const PROPOSAL_STATUS_LABELS: Record<string, string> = {
  DRAFT: "작성 중",
  REVIEWING: "검토 중",
  APPROVED: "승인됨",
  REJECTED: "반려됨",
};

export const PROPOSAL_STATUS_VARIANTS: Record<string, "warning" | "success" | "destructive" | "secondary"> = {
  DRAFT: "secondary",
  REVIEWING: "warning",
  APPROVED: "success",
  REJECTED: "destructive",
};

export const PROPOSAL_STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-[var(--axis-badge-secondary-bg,#E5E7EB)] text-[var(--axis-badge-secondary-text,#374151)]",
  REVIEWING: "bg-[var(--axis-badge-warning-bg)] text-[var(--axis-badge-warning-text)]",
  APPROVED: "bg-[var(--axis-badge-success-bg,#D1FAE5)] text-[var(--axis-badge-success-text,#065F46)]",
  REJECTED: "bg-[var(--axis-badge-destructive-bg,#FEE2E2)] text-[var(--axis-badge-destructive-text,#991B1B)]",
};

export const SECTION_CONFIG = [
  { type: "market", label: "시장 기회", icon: "📈", placeholder: "시장 규모, 성장률, 진입 기회..." },
  { type: "target", label: "목표 고객", icon: "🎯", placeholder: "타겟 고객 세그먼트, 페인포인트..." },
  { type: "model", label: "사업 모델", icon: "💲", placeholder: "수익 모델, 가격 전략..." },
  { type: "advantage", label: "경쟁 우위", icon: "🏆", placeholder: "핵심 차별점, 진입장벽..." },
  { type: "finance", label: "재무 계획", icon: "💰", placeholder: "예상 매출, 비용 구조, BEP..." },
] as const;

export const SECTION_ICONS: Record<string, string> = Object.fromEntries(
  SECTION_CONFIG.map(s => [s.type, s.icon])
);

export const SECTION_LABELS: Record<string, string> = Object.fromEntries(
  SECTION_CONFIG.map(s => [s.type, s.label])
);
