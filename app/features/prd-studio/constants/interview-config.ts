export interface SectionConfig {
  type: string;
  label: string;
  description: string;
  prompt: string;
  example: string;
  placeholder: string;
}

export const INTERVIEW_SECTIONS: SectionConfig[] = [
  {
    type: "summary",
    label: "1. 프로젝트 요약",
    description: "프로젝트의 핵심을 한눈에 파악할 수 있는 요약이에요.",
    prompt: "이 프로젝트를 한 문장으로 설명해주세요. 누구를 위한 무엇인가요?",
    example:
      "Discovery-X — AX 신사업 발굴 과정에서 관찰→실험→근거→결정을 체계화하는 내부 실험 시스템. 5명의 BD팀원이 매주 사용하며, 28일 내 의사결정 종료를 목표로 해요.",
    placeholder: "프로젝트를 한두 문장으로 요약해주세요...",
  },
  {
    type: "background",
    label: "2. 배경 & 문제",
    description: "왜 이 프로젝트가 필요한지, 현재 어떤 문제가 있는지 설명해요.",
    prompt: "현재 어떤 문제나 기회가 있나요? 왜 지금 시작해야 하나요?",
    example:
      "현재 신사업 기획이 개인의 감이나 경험에 의존하고 있어, 근거 기반 의사결정이 어렵고 학습이 축적되지 않아요. 실패한 아이디어가 반복 제안되는 경우도 있어요.",
    placeholder: "현재 상황의 문제점이나 기회를 설명해주세요...",
  },
  {
    type: "objectives",
    label: "3. 목표",
    description: "이 프로젝트가 달성하려는 핵심 목표와 성공 기준이에요.",
    prompt: "이 프로젝트의 핵심 목표는 무엇인가요? 성공하면 어떤 상태인가요?",
    example:
      "목표 1: 28일 내 Discovery 종결률 90% 이상\n목표 2: 실험 완료율 80% 이상\n목표 3: 월 1회 이상 재호출(Recall) 이벤트 발생\n성공 = 팀이 '더 잘 틀리고 더 빨리 배우는' 루프를 운영하는 상태",
    placeholder: "핵심 목표와 성공 기준을 작성해주세요...",
  },
  {
    type: "target_users",
    label: "4. 대상 사용자",
    description: "이 제품을 사용할 사람들의 특징과 역할이에요.",
    prompt: "누가 이것을 사용하나요? 주요 사용자의 특징은?",
    example:
      "주요 사용자: KTDS AX BD팀 (5명)\n- Owner: Discovery 생성~종결 전 과정 책임\n- Gatekeeper: Gate 승인/반려 결정\n- Reviewer: Evidence 검토 및 피드백\n- Viewer: 읽기 전용 참관",
    placeholder: "대상 사용자와 그들의 역할을 설명해주세요...",
  },
  {
    type: "requirements",
    label: "5. 핵심 요구사항",
    description:
      "반드시 포함해야 하는 기능(P0)과 있으면 좋은 기능(P1)이에요.",
    prompt: "반드시 있어야 하는 기능은 무엇인가요? (P0 필수 vs P1 권장)",
    example:
      "P0 (필수):\n- Discovery CRUD + 11단계 상태 전환\n- Owner/Reviewer 지정\n- Evidence 기록 (타입/강도/신뢰도)\n\nP1 (권장):\n- AI Agent 오토파일럿\n- Method Pack 12종",
    placeholder: "필수 기능과 권장 기능을 구분하여 작성해주세요...",
  },
  {
    type: "solution",
    label: "6. 해결 방안",
    description: "문제를 어떻게 해결할지 구체적인 접근 방법이에요.",
    prompt: "어떻게 해결하려고 하나요? 기술 스택이나 접근 방법은?",
    example:
      "Remix v2 + Cloudflare Pages 엣지 배포로 빠른 응답 속도 확보.\nD1 SQLite로 서버리스 DB, Drizzle ORM으로 타입 안전 쿼리.\nAI Agent가 Discovery 진행을 보조하되, Gate 결정은 반드시 인간이 수행 (HITL).",
    placeholder: "구체적인 해결 방법과 접근 방식을 설명해주세요...",
  },
  {
    type: "risks",
    label: "7. 리스크 & 제약",
    description:
      "프로젝트 진행 시 우려되는 리스크와 제약 조건이에요.",
    prompt: "가장 걱정되는 리스크나 제약은 무엇인가요?",
    example:
      "기술 리스크: D1 SQLite 트랜잭션 제한 → 복잡 쿼리 최소화\n일정 리스크: 1인 개발 → MVP 범위 엄격 통제\n비용 리스크: AI API 월 $30 미만 유지 필요\n운영 리스크: 5명 소규모 → 사용률 저조 시 피드백 수집 어려움",
    placeholder: "기술/일정/비용/운영 리스크를 작성해주세요...",
  },
  {
    type: "timeline",
    label: "8. 일정 & 리소스",
    description: "전체 일정과 투입 리소스, 마일스톤이에요.",
    prompt: "언제까지, 누가 만드나요? 주요 마일스톤은?",
    example:
      "기간: 4주 (2026-03-12 ~ 2026-04-09)\n인력: 1명 (Sinclair)\nPhase 1 (1주): CLI 적용 + DB 스키마\nPhase 2 (2주): 웹 PRD Studio MVP\nPhase 3 (1주): 분석 대체 + 전략 도구",
    placeholder: "일정, 마일스톤, 투입 리소스를 작성해주세요...",
  },
];
