/**
 * GTM(Go-to-Market) 프롬프트 빌더 — PRD + Strategy → GTM 전략 생성
 *
 * Beachhead Segment, ICP, 메시징, 채널 전략, 런치 플랜을
 * 한 번의 LLM 호출로 생성하는 프롬프트를 빌드한다.
 */

import type { PrdSectionInput } from "./strategy-prompt";
import type { StrategyResult } from "./strategy-parser";

function summarizeStrategy(strategy: StrategyResult): string {
  const parts: string[] = [];

  if (strategy.swot.strengths.length > 0) {
    parts.push(`강점: ${strategy.swot.strengths.join(", ")}`);
  }
  if (strategy.swot.opportunities.length > 0) {
    parts.push(`기회: ${strategy.swot.opportunities.join(", ")}`);
  }
  if (strategy.jtbd.who) {
    parts.push(`대상 사용자: ${strategy.jtbd.who}`);
  }
  if (strategy.leanCanvas.uniqueValueProp) {
    parts.push(`가치 제안: ${strategy.leanCanvas.uniqueValueProp}`);
  }
  if (strategy.competition.differentiation) {
    parts.push(`차별화: ${strategy.competition.differentiation}`);
  }
  if (strategy.marketSizing.som.value) {
    parts.push(`SOM: ${strategy.marketSizing.som.value}`);
  }

  return parts.length > 0 ? parts.join("\n") : "(전략 분석 결과 없음)";
}

export function buildGtmPrompt(sections: PrdSectionInput[], strategy: StrategyResult): string {
  const KEY_TYPES = new Set(["summary", "target_users", "solution", "objectives"]);
  const sectionContext = sections
    .filter((s) => KEY_TYPES.has(s.type))
    .map((s) => {
      const content = s.editedContent ?? s.generatedContent ?? "(내용 없음)";
      return `### ${s.type}\n${content}`;
    })
    .join("\n\n");

  const strategySummary = summarizeStrategy(strategy);

  return `너는 GTM(Go-to-Market) 전략 전문가야. PRD 핵심 섹션과 전략 분석 결과를 기반으로 GTM 전략을 수립해.

## PRD 핵심 섹션

${sectionContext}

## 전략 분석 요약

${strategySummary}

## 출력 형식 (반드시 JSON만 출력)

{
  "beachheadSegment": {
    "segment": "최초 진입 세그먼트 명칭",
    "rationale": "선택 근거 (2-3문장)",
    "size": "세그먼트 규모",
    "accessibility": "접근성 평가 (high|medium|low)"
  },
  "icp": {
    "profile": "이상적 고객 프로필 요약",
    "demographics": "인구통계 정보",
    "psychographics": "심리적 특성",
    "painPoints": ["핵심 페인포인트 3-5개"],
    "buyingTriggers": ["구매 트리거 3-5개"]
  },
  "messaging": {
    "oneLiner": "한 줄 메시지 (10단어 이내)",
    "elevatorPitch": "엘리베이터 피치 (3-4문장)",
    "keyMessages": ["핵심 메시지 3-5개"]
  },
  "channelStrategy": {
    "channels": [
      { "name": "채널명", "priority": "primary|secondary|experimental", "rationale": "선택 근거", "estimatedCost": "예상 비용" }
    ],
    "recommendation": "채널 전략 종합 권고 (2-3문장)"
  },
  "launchPlan": {
    "phases": [
      { "name": "페이즈명", "duration": "기간", "objectives": ["목표"], "actions": ["실행 항목"] }
    ]
  }
}

## 규칙
- 한국어로 작성
- 구체적 수치, 기업명, 사례 포함
- channel priority는 반드시 "primary", "secondary", "experimental" 중 하나
- 런치 플랜은 3-5개 페이즈로 구성
- JSON만 출력, 설명 텍스트 금지`;
}
