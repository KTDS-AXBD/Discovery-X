/**
 * Proposal 합성 프롬프트 빌더 — PRD 8섹션 + Strategy 6개 + GTM → Proposal 10섹션
 *
 * 각 Proposal 섹션에 필요한 PRD/전략/GTM 소스를 매핑하여
 * 섹션별 합성 프롬프트를 생성한다.
 */

import type { PrdSectionInput } from "./strategy-prompt";
import type { StrategyResult, GtmResult } from "../types";

const PROPOSAL_SECTION_TYPES = [
  "overview", "content", "hypothesis", "target_market", "target_customer",
  "value_proposition", "revenue_model", "scenario", "mvp", "execution_plan",
] as const;

const SECTION_STRATEGY_MAP: Record<string, { prd: string[]; strategy: (keyof StrategyResult)[]; gtm: (keyof GtmResult)[] }> = {
  overview: { prd: ["summary", "background"], strategy: ["leanCanvas"], gtm: [] },
  content: { prd: ["solution", "requirements"], strategy: ["leanCanvas"], gtm: [] },
  hypothesis: { prd: ["background", "objectives"], strategy: ["swot", "jtbd"], gtm: [] },
  target_market: { prd: ["target_users", "background"], strategy: ["marketSizing", "competition"], gtm: ["beachheadSegment"] },
  target_customer: { prd: ["target_users"], strategy: ["jtbd"], gtm: ["icp"] },
  value_proposition: { prd: ["objectives", "solution"], strategy: ["jtbd", "competition"], gtm: ["messaging"] },
  revenue_model: { prd: ["requirements", "timeline"], strategy: ["leanCanvas"], gtm: ["channelStrategy"] },
  scenario: { prd: ["risks", "timeline"], strategy: ["riskAssessment", "marketSizing"], gtm: [] },
  mvp: { prd: ["solution", "requirements"], strategy: ["leanCanvas"], gtm: ["launchPlan"] },
  execution_plan: { prd: ["timeline", "risks"], strategy: ["riskAssessment"], gtm: ["launchPlan"] },
};

const SECTION_LABELS: Record<string, string> = {
  overview: "사업 개요", content: "사업 내용", hypothesis: "핵심 가설",
  target_market: "타겟 시장", target_customer: "타겟 고객",
  value_proposition: "가치 제안", revenue_model: "수익 구조",
  scenario: "시나리오", mvp: "MVP 정의", execution_plan: "실행 방안",
};

function collectPrdContent(sections: PrdSectionInput[], types: string[]): string {
  return sections
    .filter((s) => types.includes(s.type))
    .map((s) => s.editedContent ?? s.generatedContent ?? "")
    .filter(Boolean)
    .join("\n\n");
}

function collectStrategyContent(strategy: StrategyResult | null, keys: (keyof StrategyResult)[]): string {
  if (!strategy) return "";
  return keys.map((k) => JSON.stringify(strategy[k], null, 2)).join("\n");
}

function collectGtmContent(gtm: GtmResult | null, keys: (keyof GtmResult)[]): string {
  if (!gtm) return "";
  return keys.map((k) => JSON.stringify(gtm[k], null, 2)).join("\n");
}

export function buildProposalSynthesisPrompt(
  proposalType: string,
  sections: PrdSectionInput[],
  strategy: StrategyResult | null,
  gtm: GtmResult | null,
): string {
  const mapping = SECTION_STRATEGY_MAP[proposalType];
  if (!mapping) return "";

  const label = SECTION_LABELS[proposalType] ?? proposalType;
  const prdContent = collectPrdContent(sections, mapping.prd);
  const strategyContent = collectStrategyContent(strategy, mapping.strategy);
  const gtmContent = collectGtmContent(gtm, mapping.gtm);

  return `사업 제안서의 "${label}" 섹션을 작성해줘.

## PRD 관련 내용
${prdContent || "(없음)"}

## 전략 분석 결과
${strategyContent || "(없음)"}

## GTM 분석 결과
${gtmContent || "(없음)"}

## 규칙
- 마크다운 형식으로 작성
- 한국어
- 분석 자료를 종합하여 사업제안서 톤으로 재구성
- 핵심만 간결하게 (300-600자)`;
}

export { PROPOSAL_SECTION_TYPES, SECTION_LABELS };
