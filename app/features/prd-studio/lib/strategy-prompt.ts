/**
 * 전략 프레임워크 프롬프트 빌더 — PRD 8섹션 → 6개 전략 분석 일괄 생성
 *
 * SWOT, Lean Canvas, JTBD, 경쟁 분석, 시장 규모, 리스크 평가를
 * 한 번의 LLM 호출로 생성하는 프롬프트를 빌드한다.
 */

export interface PrdSectionInput {
  type: string;
  generatedContent: string | null;
  editedContent: string | null;
}

export function buildStrategyPrompt(sections: PrdSectionInput[]): string {
  const sectionContext = sections
    .map((s) => {
      const content = s.editedContent ?? s.generatedContent ?? "(내용 없음)";
      return `### ${s.type}\n${content}`;
    })
    .join("\n\n");

  return `너는 전략 분석 전문가야. 아래 PRD 섹션을 기반으로 6개 전략 프레임워크를 한 번에 생성해.

## PRD 섹션

${sectionContext}

## 출력 형식 (반드시 JSON만 출력)

{
  "swot": {
    "strengths": ["강점 3-5개"],
    "weaknesses": ["약점 3-5개"],
    "opportunities": ["기회 3-5개"],
    "threats": ["위협 3-5개"],
    "crossAnalysis": "SO/ST/WO/WT 교차 분석 요약 (2-3문장)"
  },
  "leanCanvas": {
    "problem": "핵심 문제 (1-3개)",
    "solution": "해결책 요약",
    "keyMetrics": "핵심 지표",
    "uniqueValueProp": "고유 가치 제안",
    "unfairAdvantage": "경쟁 우위",
    "channels": "채널 전략",
    "customerSegments": "고객 세그먼트",
    "costStructure": "비용 구조",
    "revenueStreams": "수익 모델"
  },
  "jtbd": {
    "who": "누가 (사용자/고객 프로필)",
    "why": "왜 (해결하려는 근본 동기)",
    "whatBefore": "현재 상황 (기존 해결책/불편)",
    "how": "어떻게 (제품이 돕는 방식)",
    "whatAfter": "이후 상황 (달성되는 결과)",
    "alternatives": "대안 (경쟁 해결책들)"
  },
  "competition": {
    "directCompetitors": [
      { "name": "경쟁사명", "description": "설명", "strengths": ["강점"], "weaknesses": ["약점"] }
    ],
    "indirectCompetitors": [
      { "name": "간접 경쟁사명", "description": "설명", "strengths": ["강점"], "weaknesses": ["약점"] }
    ],
    "differentiation": "차별화 전략 요약"
  },
  "marketSizing": {
    "tam": { "value": "TAM 금액/규모", "description": "산출 근거" },
    "sam": { "value": "SAM 금액/규모", "description": "산출 근거" },
    "som": { "value": "SOM 금액/규모", "description": "산출 근거" },
    "methodology": "산출 방법론 (Top-down/Bottom-up)",
    "assumptions": ["핵심 가정 1", "핵심 가정 2"]
  },
  "riskAssessment": {
    "risks": [
      { "category": "기술|시장|규제|운영|재무", "description": "리스크 설명", "impact": "high|medium|low", "likelihood": "high|medium|low", "mitigation": "완화 전략" }
    ],
    "overallRiskLevel": "high|medium|low",
    "summary": "전체 리스크 요약 (2-3문장)"
  }
}

## 규칙
- 한국어로 작성
- PRD에 명시된 정보와 추론을 구분
- 구체적 수치, 기업명, 사례 포함
- SWOT 각 항목 3-5개, 리스크 3-7개
- impact/likelihood는 반드시 "high", "medium", "low" 중 하나
- JSON만 출력, 설명 텍스트 금지`;
}
