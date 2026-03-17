/**
 * pm-skills(https://github.com/phuryn/pm-skills) 기반 스킬 카탈로그 시드 데이터.
 *
 * 10개 핵심 스킬 — 5개 카테고리(discovery, strategy, go-to-market, market-research, execution)
 * chainNext로 스킬 간 추천 흐름(DAG)을 정의한다.
 */

export interface SkillSeed {
  slug: string;
  name: string;
  description: string;
  category: string;
  inputType: string;
  promptTemplate: string;
  outputSchema: Record<string, unknown>;
  chainNext: string[];
  sortOrder: number;
}

export const SKILL_SEEDS: SkillSeed[] = [
  // ── Discovery ──────────────────────────────────────────────────────
  {
    slug: "discover",
    name: "풀 디스커버리",
    description:
      "브레인스토밍 → 가정 식별 → 실험 설계까지 전체 디스커버리 사이클을 한 번에 수행한다.",
    category: "discovery",
    inputType: "text",
    promptTemplate: `당신은 시니어 프로덕트 매니저입니다.

아래 소스 자료를 바탕으로 풀 디스커버리 사이클을 수행하세요.

## 소스 자료
{{sources}}

## 지시사항
1. **브레인스토밍**: PM·디자이너·엔지니어 3관점에서 각 5개 아이디어를 도출하세요.
2. **가정 식별**: 도출된 아이디어에서 핵심 가정(Value, Usability, Viability, Feasibility) 최소 8개를 추출하세요.
3. **우선순위**: Impact × Risk 매트릭스로 상위 5개 가정을 선정하세요.
4. **실험 설계**: 상위 가정별로 최소 비용 검증 실험 1개를 설계하세요.

## 출력 형식
반드시 아래 JSON 구조로 응답하세요.`,
    outputSchema: {
      ideas: {
        type: "array",
        items: {
          perspective: "string (pm | designer | engineer)",
          title: "string",
          description: "string",
        },
      },
      assumptions: {
        type: "array",
        items: {
          id: "string",
          statement: "string",
          dimension: "string (value | usability | viability | feasibility)",
          impact: "number (1-5)",
          risk: "number (1-5)",
        },
      },
      prioritized: {
        type: "array",
        description: "상위 5개 가정 ID",
      },
      experiments: {
        type: "array",
        items: {
          assumptionId: "string",
          method: "string",
          hypothesis: "string",
          successCriteria: "string",
          estimatedDays: "number",
        },
      },
    },
    chainNext: ["product-strategy", "lean-canvas"],
    sortOrder: 1,
  },

  {
    slug: "brainstorm-ideas",
    name: "아이디어 브레인스토밍",
    description:
      "PM·디자이너·엔지니어 3관점에서 각 5개씩 아이디어를 발산하고 상위 5개를 선정한다.",
    category: "discovery",
    inputType: "text",
    promptTemplate: `당신은 프로덕트 디스커버리 전문가입니다.

아래 소스 자료를 바탕으로 3관점 아이디어 브레인스토밍을 수행하세요.

## 소스 자료
{{sources}}

## 지시사항
1. **PM 관점**: 시장 적합성, 가치 창출, 경쟁 차별화 중심으로 5개 아이디어
2. **디자이너 관점**: UX 플로우, 온보딩, 인게이지먼트 중심으로 5개 아이디어
3. **엔지니어 관점**: 기술 가능성, API 통합, 플랫폼 역량 중심으로 5개 아이디어
4. **우선순위**: 전체 15개 중 핵심 문제 해결력·검증 속도·차별화 기준으로 상위 5개 선정
5. **가정**: 상위 5개 각각에 대해 핵심 가정과 검증 필요 사항을 기술

## 출력 형식
반드시 아래 JSON 구조로 응답하세요.`,
    outputSchema: {
      perspectives: {
        pm: { type: "array", items: { title: "string", description: "string", rationale: "string" } },
        designer: { type: "array", items: { title: "string", description: "string", rationale: "string" } },
        engineer: { type: "array", items: { title: "string", description: "string", rationale: "string" } },
      },
      top5: {
        type: "array",
        items: {
          rank: "number",
          title: "string",
          perspective: "string",
          keyAssumption: "string",
          validationNeeded: "string",
        },
      },
    },
    chainNext: ["discover", "swot-analysis", "competitor-analysis"],
    sortOrder: 2,
  },

  // ── Strategy ───────────────────────────────────────────────────────
  {
    slug: "product-strategy",
    name: "제품 전략 캔버스",
    description:
      "비전부터 경쟁 방어력까지 9섹션 전략 캔버스를 작성한다.",
    category: "strategy",
    inputType: "text",
    promptTemplate: `당신은 프로덕트 전략 컨설턴트입니다.

아래 소스 자료를 바탕으로 9섹션 Product Strategy Canvas를 작성하세요.

## 소스 자료
{{sources}}

## 9개 섹션
1. **비전(Vision)**: 영감을 주는 목적, 핵심 가치
2. **시장 세그먼트(Market Segments)**: 2~3개 우선 세그먼트, JTBD 기반
3. **상대적 비용 포지셔닝(Relative Costs)**: 저가 vs 프리미엄 위치
4. **가치 제안(Value Proposition)**: Before/How/After 내러티브 + 대안 솔루션
5. **트레이드오프(Trade-offs)**: 명시적으로 제외하는 기능·시장
6. **핵심 지표(Key Metrics)**: North Star Metric + 분기 OMTM
7. **성장(Growth)**: GTM 접근법, 채널, 유닛 이코노믹스
8. **역량(Capabilities)**: 필수 역량, Build vs Partner
9. **방어력(Defensibility)**: 네트워크 효과, 전환 비용, IP

## 출력 형식
반드시 아래 JSON 구조로 응답하세요.`,
    outputSchema: {
      vision: { purpose: "string", coreValues: "string[]" },
      marketSegments: {
        type: "array",
        items: { segment: "string", jtbd: "string", priority: "number" },
      },
      relativeCosts: { positioning: "string", rationale: "string" },
      valueProposition: { before: "string", how: "string", after: "string", alternatives: "string[]" },
      tradeoffs: { excluded: "string[]", rationale: "string" },
      keyMetrics: { northStar: "string", omtm: "string", supportingMetrics: "string[]" },
      growth: { gtmApproach: "string", channels: "string[]", unitEconomics: "string" },
      capabilities: { required: "string[]", buildVsPartner: "Record<string, string>" },
      defensibility: { moats: "string[]", barriers: "string[]" },
    },
    chainNext: ["lean-canvas", "gtm-strategy", "create-prd"],
    sortOrder: 3,
  },

  {
    slug: "swot-analysis",
    name: "SWOT 분석",
    description:
      "내부 강점·약점과 외부 기회·위협을 분석하고 전략적 권고를 도출한다.",
    category: "strategy",
    inputType: "text",
    promptTemplate: `당신은 전략 분석 전문가입니다.

아래 소스 자료를 바탕으로 SWOT 분석을 수행하세요.

## 소스 자료
{{sources}}

## 지시사항
1. **Strengths**: 내부 경쟁 우위 5~7개 (고유 역량, 기술, 브랜드)
2. **Weaknesses**: 내부 취약점 5~7개 (자원 제약, 기술 한계)
3. **Opportunities**: 외부 기회 5~7개 (성장 시장, 기술 트렌드)
4. **Threats**: 외부 위협 5~7개 (경쟁사, 규제 변화)
5. **크로스 분석**: S×O(Build), W×T(Defend), S×T(Pivot) 전략 도출
6. **권고사항**: 3~5개 실행 가능한 전략적 권고

## 출력 형식
반드시 아래 JSON 구조로 응답하세요.`,
    outputSchema: {
      strengths: { type: "array", items: "string" },
      weaknesses: { type: "array", items: "string" },
      opportunities: { type: "array", items: "string" },
      threats: { type: "array", items: "string" },
      crossAnalysis: {
        build: "string (S×O 전략)",
        defend: "string (W×T 전략)",
        pivot: "string (S×T 전략)",
      },
      recommendations: {
        type: "array",
        items: { action: "string", owner: "string", metric: "string" },
      },
    },
    chainNext: ["product-strategy", "lean-canvas", "competitor-analysis"],
    sortOrder: 4,
  },

  {
    slug: "lean-canvas",
    name: "린 캔버스",
    description:
      "가설 중심 비즈니스 모델링 — 9블록 Lean Canvas를 작성한다.",
    category: "strategy",
    inputType: "text",
    promptTemplate: `당신은 린 스타트업 전문가입니다.

아래 소스 자료를 바탕으로 Lean Canvas를 작성하세요.

## 소스 자료
{{sources}}

## 9개 블록
1. **문제(Problem)**: 상위 3개 고객 페인포인트 + 현재의 불충분한 대안
2. **솔루션(Solution)**: 각 문제를 해결하는 상위 3개 기능
3. **고유 가치 제안(UVP)**: "더 나은" 이상의 차별화 한 문장
4. **비공정 우위(Unfair Advantage)**: 네트워크 효과, IP, 전환 비용
5. **고객 세그먼트(Customer Segments)**: 타겟 페르소나, 얼리 어답터
6. **채널(Channels)**: 획득 경로, 유통 방식
7. **수익 흐름(Revenue Streams)**: 과금 모델, LTV, 성장 가정
8. **비용 구조(Cost Structure)**: 고정/변동 비용, CAC
9. **핵심 지표(Key Metrics)**: 활성화·리텐션·매출 + North Star

## 출력 형식
반드시 아래 JSON 구조로 응답하세요.`,
    outputSchema: {
      problem: { painPoints: "string[]", existingAlternatives: "string[]" },
      solution: { features: "string[]" },
      uvp: { statement: "string" },
      unfairAdvantage: { moats: "string[]" },
      customerSegments: { target: "string", earlyAdopters: "string" },
      channels: { acquisition: "string[]", distribution: "string[]" },
      revenueStreams: { model: "string", ltv: "string", assumptions: "string[]" },
      costStructure: { fixed: "string[]", variable: "string[]", cac: "string" },
      keyMetrics: { northStar: "string", activation: "string", retention: "string", revenue: "string" },
    },
    chainNext: ["gtm-strategy", "create-prd"],
    sortOrder: 5,
  },

  // ── Go-to-Market ───────────────────────────────────────────────────
  {
    slug: "gtm-strategy",
    name: "GTM 전략",
    description:
      "채널 선정, 메시징 프레임워크, KPI, 90일 런칭 로드맵을 수립한다.",
    category: "go-to-market",
    inputType: "text",
    promptTemplate: `당신은 Go-to-Market 전략가입니다.

아래 소스 자료를 바탕으로 GTM 전략을 수립하세요.

## 소스 자료
{{sources}}

## 지시사항
1. **채널 평가**: 3~5개 채널을 도달성·비용·확장성 기준으로 평가
2. **메시징 프레임워크**: 세그먼트별 포지셔닝, 가치 제안, 경쟁 차별점
3. **KPI 정의**: 인지→참여→전환→매출→시장 침투 단계별 KPI
4. **런칭 로드맵**: 90일 실행 계획 (사전 준비 / D-Day / 사후 최적화)
5. **리스크 완화**: 주요 리스크 3개 + 대응 전략

## 출력 형식
반드시 아래 JSON 구조로 응답하세요.`,
    outputSchema: {
      channels: {
        type: "array",
        items: {
          name: "string",
          reach: "string",
          cost: "string",
          scalability: "string",
          recommendation: "string",
        },
      },
      messaging: {
        type: "array",
        items: { segment: "string", positioning: "string", valueProp: "string" },
      },
      kpis: {
        awareness: "string[]",
        engagement: "string[]",
        conversion: "string[]",
        revenue: "string[]",
      },
      launchRoadmap: {
        preLaunch: "string[]",
        launch: "string[]",
        postLaunch: "string[]",
      },
      risks: {
        type: "array",
        items: { risk: "string", mitigation: "string" },
      },
    },
    chainNext: ["ideal-customer-profile", "create-prd"],
    sortOrder: 6,
  },

  {
    slug: "ideal-customer-profile",
    name: "이상적 고객 프로필 (ICP)",
    description:
      "인구통계·행동·JTBD·페인포인트 기반으로 이상적 고객 프로필을 정의한다.",
    category: "go-to-market",
    inputType: "text",
    promptTemplate: `당신은 고객 리서치 전문가입니다.

아래 소스 자료를 바탕으로 이상적 고객 프로필(ICP)을 정의하세요.

## 소스 자료
{{sources}}

## 지시사항
1. **인구통계(Demographics)**: 기업 규모, 산업, 지역, 직책
2. **행동(Behaviors)**: 의사결정 패턴, 도입 스타일, 평가 기준
3. **JTBD**: 기능적·감정적·사회적 목표
4. **페인포인트**: 현재 워크어라운드, 한계, 비즈니스 임팩트
5. **적격성 기준**: 적격/부적격 시그널
6. **이상 중의 이상**: ICP 내 최고 가치 세그먼트

## 출력 형식
반드시 아래 JSON 구조로 응답하세요.`,
    outputSchema: {
      demographics: {
        companySize: "string",
        industry: "string[]",
        region: "string[]",
        roles: "string[]",
      },
      behaviors: {
        decisionProcess: "string",
        adoptionStyle: "string",
        evaluationCriteria: "string[]",
      },
      jtbd: {
        functional: "string[]",
        emotional: "string[]",
        social: "string[]",
      },
      painPoints: {
        currentWorkarounds: "string[]",
        limitations: "string[]",
        businessImpact: "string",
      },
      qualification: {
        qualifiedSignals: "string[]",
        disqualifiedSignals: "string[]",
      },
      idealOfIdeal: { description: "string", rationale: "string" },
    },
    chainNext: ["gtm-strategy", "competitor-analysis"],
    sortOrder: 7,
  },

  // ── Market Research ────────────────────────────────────────────────
  {
    slug: "competitor-analysis",
    name: "경쟁사 분석",
    description:
      "5개 직접 경쟁사를 식별하고 강점·약점·차별화 기회를 분석한다.",
    category: "market-research",
    inputType: "text",
    promptTemplate: `당신은 경쟁 전략 분석가입니다.

아래 소스 자료를 바탕으로 경쟁사 분석을 수행하세요.

## 소스 자료
{{sources}}

## 지시사항
1. **시장 범위**: 대상 시장과 고객 기반 정의
2. **경쟁사 식별**: 직접 경쟁사 5개 선정
3. **경쟁사별 분석** (각각):
   - 회사 프로필 및 시장 포커스
   - 핵심 제품 강점 및 차별점
   - 약점 및 기능 갭
   - 비즈니스 모델 및 가격 전략
4. **차별화 맵핑**: 미충족 니즈, 공백 시장 세그먼트
5. **포지셔닝 권고**: 타겟 세그먼트, 핵심 차별점, 12~18개월 리스크

## 출력 형식
반드시 아래 JSON 구조로 응답하세요.`,
    outputSchema: {
      marketScope: { definition: "string", customerBase: "string" },
      competitors: {
        type: "array",
        items: {
          name: "string",
          profile: "string",
          strengths: "string[]",
          weaknesses: "string[]",
          pricing: "string",
          threat: "string (high | medium | low)",
        },
      },
      differentiationGaps: "string[]",
      positioning: {
        targetSegments: "string[]",
        keyDifferentiators: "string[]",
        risks: "string[]",
      },
    },
    chainNext: ["swot-analysis", "market-sizing", "product-strategy"],
    sortOrder: 8,
  },

  {
    slug: "market-sizing",
    name: "시장 규모 추정",
    description:
      "Top-down + Bottom-up 이중 접근으로 TAM/SAM/SOM을 추정한다.",
    category: "market-research",
    inputType: "text",
    promptTemplate: `당신은 시장 분석 전문가입니다.

아래 소스 자료를 바탕으로 시장 규모를 추정하세요.

## 소스 자료
{{sources}}

## 지시사항
1. **시장 정의**: 문제 공간, 고객 세그먼트, 지역, 제약 조건
2. **Top-down 추정**: 산업 규모 → 관련 세그먼트로 축소
3. **Bottom-up 추정**: 고객 수 × 가격 × 구매 빈도
4. **TAM/SAM/SOM 산출**:
   - TAM: 전체 시장 기회 (현재 + 2~3년 전망)
   - SAM: 실제 제품 역량·유통 기반의 접근 가능 시장
   - SOM: 1~3년 현실적 시장 점유 (경쟁·실행력 감안)
5. **교차 검증**: Top-down과 Bottom-up 결과 비교 및 차이 설명
6. **가정 목록**: 번호별 가정 + 신뢰도(상/중/하)

## 출력 형식
반드시 아래 JSON 구조로 응답하세요.`,
    outputSchema: {
      marketDefinition: { problemSpace: "string", segments: "string[]", geography: "string" },
      topDown: { industrySize: "string", narrowing: "string[]", estimate: "string" },
      bottomUp: { customers: "string", pricing: "string", frequency: "string", estimate: "string" },
      tam: { current: "string", projected: "string", growthRate: "string" },
      sam: { current: "string", rationale: "string" },
      som: { year1: "string", year3: "string", rationale: "string" },
      crossValidation: { comparison: "string", reconciliation: "string" },
      assumptions: {
        type: "array",
        items: { id: "number", statement: "string", confidence: "string (high | medium | low)" },
      },
    },
    chainNext: ["competitor-analysis", "gtm-strategy", "lean-canvas"],
    sortOrder: 9,
  },

  // ── Execution ──────────────────────────────────────────────────────
  {
    slug: "create-prd",
    name: "PRD 작성",
    description:
      "8섹션 구조의 Product Requirements Document를 작성한다.",
    category: "execution",
    inputType: "text",
    promptTemplate: `당신은 시니어 프로덕트 매니저입니다.

아래 소스 자료를 바탕으로 8섹션 PRD를 작성하세요.

## 소스 자료
{{sources}}

## 8개 섹션
1. **요약(Summary)**: 이니셔티브 개요 2~3문장
2. **담당자(Contacts)**: 핵심 이해관계자, 역할, 비고
3. **배경(Background)**: 이니셔티브 배경, 타이밍 근거, 가능 요인
4. **목표(Objective)**: 목표, 비즈니스/고객 혜택, 전략 정렬, SMART OKR
5. **시장 세그먼트(Market Segments)**: JTBD 기반 타겟 (인구통계 아님)
6. **가치 제안(Value Propositions)**: 고객 니즈, 제공 가치, 해소 고통, 경쟁 우위
7. **솔루션(Solution)**: UX/프로토타입, 상세 기능, 기술 스택, 검증된 가정
8. **릴리스(Release)**: 타임라인, MVP 범위, 버전별 단계 계획

## 원칙
- 가능한 한 데이터 기반, 구체적으로 기술
- 검증되지 않은 가정은 명시적으로 플래그
- 전략적 연결을 전체적으로 유지

## 출력 형식
반드시 아래 JSON 구조로 응답하세요.`,
    outputSchema: {
      summary: "string",
      contacts: {
        type: "array",
        items: { name: "string", role: "string", note: "string" },
      },
      background: { context: "string", timing: "string", enablers: "string[]" },
      objective: {
        goals: "string[]",
        businessBenefit: "string",
        customerBenefit: "string",
        okrs: { type: "array", items: { objective: "string", keyResults: "string[]" } },
      },
      marketSegments: {
        type: "array",
        items: { segment: "string", jtbd: "string", size: "string" },
      },
      valuePropositions: {
        type: "array",
        items: { need: "string", gain: "string", painRelieved: "string" },
      },
      solution: {
        ux: "string",
        features: "string[]",
        techStack: "string[]",
        validatedAssumptions: "string[]",
        unvalidatedAssumptions: "string[]",
      },
      release: {
        timeline: "string",
        mvpScope: "string[]",
        phases: { type: "array", items: { version: "string", scope: "string[]", target: "string" } },
      },
    },
    chainNext: [],
    sortOrder: 10,
  },
];
