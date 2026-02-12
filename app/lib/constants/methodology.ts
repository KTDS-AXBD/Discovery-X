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
export const VALID_CATEGORY_KEYS = ALL_METHODOLOGIES.map((m) => m.key);

/** Methodology-specific analysis prompt instructions */
export const METHODOLOGY_PROMPTS: Record<string, string> = {
  market_research: `시장 규모(TAM 추정), 주요 경쟁사, 산업 트렌드, 성장률을 분석하세요.
출력: 시장 개요 > 경쟁 환경 > 트렌드 > 기회/위협`,
  customer_research: `타겟 고객 세그먼트, 핵심 니즈, 페인포인트, JTBD를 분석하세요.
출력: 고객 세그먼트 > 니즈/페인 > 고객 여정 > 인사이트`,
  critical_thinking: `핵심 가정 식별, 반론(Devil's Advocate), 실패 시나리오, 리스크를 분석하세요.
출력: 핵심 가정 > 반론 > 리스크 매트릭스 > 검증 필요 항목`,
  bmc: `Business Model Canvas 9블록을 분석하세요: 고객 세그먼트, 가치 제안, 채널, 고객 관계, 수익원, 핵심 자원, 핵심 활동, 핵심 파트너, 비용 구조.
출력: 블록별 분석 > 연결 관계 > 약점/보완점`,
  swot: `강점(Strengths), 약점(Weaknesses), 기회(Opportunities), 위협(Threats)을 분석하세요.`,
  regulation: `관련 법규, 인허가 요건, 컴플라이언스 이슈를 분석하세요.`,
  feasibility: `수익 모델, 비용 구조, 단위 경제학, BEP를 분석하세요.`,
  differentiation: `경쟁 환경, 차별화 포인트, 진입 장벽을 분석하세요.`,
  industry_example: `유사 산업의 성공/실패 사례를 분석하세요.`,
  value_chain: `주요 활동별 가치 흐름을 분석하세요.`,
  lean_canvas: `Problem, Solution, Key Metrics, Unique Value Proposition 등을 분석하세요.`,
  pestel: `정치/경제/사회/기술/환경/법률 외부 환경 요인을 분석하세요.`,
};
