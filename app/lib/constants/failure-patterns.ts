/**
 * DEAD_END 결정 시 사용되는 실패 패턴 목록
 * PRD §8.2: 실패를 조직 자산으로 축적하기 위한 태깅 시스템
 */

export const FAILURE_PATTERNS = [
  {
    id: "assumption_invalidated",
    label: "전제 가정 붕괴",
    description: "핵심 가정이 실험 중 거짓으로 판명됨",
  },
  {
    id: "no_user_demand",
    label: "수요 부재",
    description: "고객/사용자가 원하지 않음이 명확히 확인됨",
  },
  {
    id: "technical_infeasible",
    label: "기술적 불가능",
    description: "현재 기술 수준으로 구현 불가능 (28일 내)",
  },
  {
    id: "resource_unavailable",
    label: "리소스 확보 실패",
    description: "필수 인력/예산/데이터를 확보할 수 없음",
  },
  {
    id: "regulation_blocked",
    label: "규제/정책 장벽",
    description: "법규, 사내 정책, 계약 등으로 진행 불가",
  },
  {
    id: "market_timing_wrong",
    label: "시장 타이밍 오류",
    description: "너무 이르거나 늦어서 기회 상실",
  },
  {
    id: "competitive_moat_insufficient",
    label: "경쟁 우위 부족",
    description: "경쟁사 대비 차별화 불가능",
  },
  {
    id: "unit_economics_broken",
    label: "단위 경제성 붕괴",
    description: "고객당 비용/수익 구조가 성립하지 않음",
  },
  {
    id: "scope_too_large",
    label: "스코프 과대",
    description: "28일 내 검증 불가능한 규모로 판명",
  },
  {
    id: "dependency_failed",
    label: "의존성 실패",
    description: "다른 시스템/팀/외부 파트너가 막혀 진행 불가",
  },
] as const;

export type FailurePatternId = (typeof FAILURE_PATTERNS)[number]["id"];

/**
 * Trigger Type 정의 (NOT_NOW 결정 시 사용)
 * PRD §5.1: 재검토 조건을 명확히 하기 위한 분류
 */
export const TRIGGER_TYPES = [
  {
    id: "Technology_Maturity",
    label: "기술 성숙도",
    description: "특정 기술/라이브러리가 프로덕션 레디 상태가 되면",
    example: "LangChain의 Agent 안정화, WebGPU 브라우저 지원 80% 도달",
  },
  {
    id: "Policy_Regulation",
    label: "정책/규제",
    description: "법규, 사내 정책, 업계 표준이 변경되면",
    example: "개인정보보호법 개정, 데이터 활용 가이드라인 확정",
  },
  {
    id: "Customer_Behavior",
    label: "고객 행동",
    description: "고객의 특정 행동 패턴이 관찰되면",
    example: "월간 활성 사용자 1000명 돌파, NPS 50 이상 달성",
  },
  {
    id: "Internal_Capability",
    label: "내부 역량",
    description: "팀 구성, 인프라, 프로세스가 갖춰지면",
    example: "ML 엔지니어 채용 완료, A/B 테스트 플랫폼 구축",
  },
] as const;

export type TriggerTypeId = (typeof TRIGGER_TYPES)[number]["id"];

/**
 * Evidence Type 정의
 * PRD §5.1: 근거의 종류
 */
export const EVIDENCE_TYPES = [
  {
    id: "DATA",
    label: "데이터",
    description: "정량 데이터, 로그, 통계",
    example: "사용자 50명이 평균 3분 단축 (기존 15분 → 12분)",
  },
  {
    id: "USER",
    label: "사용자 피드백",
    description: "인터뷰, 설문, 관찰",
    example: "인터뷰 10명 중 8명이 '시간 절약' 언급",
  },
  {
    id: "ARTIFACT",
    label: "산출물",
    description: "프로토타입, 문서, 코드",
    example: "POC 코드 저장소 링크, Figma 프로토타입",
  },
  {
    id: "REF",
    label: "외부 참조",
    description: "논문, 사례, 벤치마크",
    example: "Anthropic RAG 벤치마크 논문, 경쟁사 사례",
  },
  {
    id: "ASSUMPTION",
    label: "가정",
    description: "검증되지 않은 추론 (약한 근거)",
    example: "'아마도 효과가 있을 것'이라는 추측",
  },
] as const;

export type EvidenceTypeId = (typeof EVIDENCE_TYPES)[number]["id"];

/**
 * Evidence Strength 정의
 * PRD §5.1: 근거의 강도
 */
export const EVIDENCE_STRENGTHS = [
  {
    id: "A",
    label: "A급 (Hard)",
    description: "재현 가능한 정량 데이터",
    color: "green",
    example: "A/B 테스트 결과, 로그 분석",
  },
  {
    id: "B",
    label: "B급 (Direct)",
    description: "직접 관찰/인터뷰",
    color: "blue",
    example: "사용자 인터뷰, 프로토타입 사용 관찰",
  },
  {
    id: "C",
    label: "C급 (Indirect)",
    description: "간접 증거, 유사 사례",
    color: "yellow",
    example: "경쟁사 사례, 논문, 벤치마크",
  },
  {
    id: "D",
    label: "D급 (Intuition)",
    description: "추론, 직관, 가정",
    color: "red",
    example: "'~할 것 같다', '~일 수도 있다'",
  },
] as const;

export type EvidenceStrengthId = (typeof EVIDENCE_STRENGTHS)[number]["id"];
