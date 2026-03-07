/**
 * Methodology categories for idea analysis.
 * Shared between frontend (cards) and backend (agent prompts).
 */

// Primary (always visible — 4 cards)
export const PRIMARY_METHODOLOGIES = [
  { key: "market_research", label: "시장 조사", description: "경쟁사, 시장규모, 산업현황", icon: "chart" },
  { key: "customer_research", label: "고객 조사", description: "타겟 고객, 니즈/페인포인트", icon: "users" },
  { key: "critical_thinking", label: "비판적 사고", description: "가설 검증, 반론, 리스크", icon: "shield" },
  { key: "bmc", label: "BMC", description: "Business Model Canvas 9블록", icon: "grid" },
] as const;

// Secondary (expandable via "+" button)
export const SECONDARY_METHODOLOGIES = [
  { key: "swot", label: "SWOT 분석", description: "강점/약점/기회/위협" },
  { key: "regulation", label: "규제/법", description: "관련 법규, 인허가, 컴플라이언스" },
  { key: "feasibility", label: "사업성 검증", description: "수익 모델, 비용 구조, 단위 경제학" },
  { key: "differentiation", label: "차별화", description: "경쟁 환경, 차별화 포인트" },
  { key: "industry_example", label: "산업별 사례", description: "유사 산업 성공/실패 사례" },
  { key: "value_chain", label: "가치 사슬", description: "주요 활동별 가치 흐름" },
  { key: "lean_canvas", label: "린 캔버스", description: "Problem-Solution Fit" },
  { key: "pestel", label: "PESTEL", description: "정치/경제/사회/기술/환경/법률" },
] as const;

export const ALL_METHODOLOGIES = [...PRIMARY_METHODOLOGIES, ...SECONDARY_METHODOLOGIES];
