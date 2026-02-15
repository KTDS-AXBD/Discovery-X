/**
 * Maps analysis categories to proposal sections.
 * 12 analysis categories → 10 proposal section types.
 */

import { ProposalSectionType } from "~/features/proposals/db/schema";

export interface AnalysisEntry {
  title: string;
  content: string;
  sourceIds?: string[];
  analyzedAt?: string;
}

export interface ProposalSectionContent {
  type: string;
  content: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  market_research: "시장 조사",
  customer_research: "고객 조사",
  critical_thinking: "비판적 사고",
  bmc: "BMC",
  swot: "SWOT 분석",
  regulation: "규제/법",
  feasibility: "사업성 검증",
  differentiation: "차별화",
  industry_example: "산업별 사례",
  value_chain: "가치 사슬",
  lean_canvas: "린 캔버스",
  pestel: "PESTEL",
};

/** Which analysis categories feed into each proposal section */
const SECTION_CATEGORY_MAP: Record<string, string[]> = {
  [ProposalSectionType.OVERVIEW]: ["bmc", "industry_example"],
  [ProposalSectionType.CONTENT]: ["bmc", "value_chain"],
  [ProposalSectionType.HYPOTHESIS]: ["critical_thinking", "swot"],
  [ProposalSectionType.TARGET_MARKET]: ["market_research"],
  [ProposalSectionType.TARGET_CUSTOMER]: ["customer_research"],
  [ProposalSectionType.VALUE_PROPOSITION]: ["differentiation", "value_chain"],
  [ProposalSectionType.REVENUE_MODEL]: ["feasibility"],
  [ProposalSectionType.SCENARIO]: ["feasibility", "pestel"],
  [ProposalSectionType.MVP]: ["lean_canvas", "bmc"],
  [ProposalSectionType.EXECUTION_PLAN]: ["regulation", "industry_example"],
};

export function mapAnalysisToSections(
  analysisData: Record<string, AnalysisEntry>,
  selectedCategories: string[],
): ProposalSectionContent[] {
  const selectedSet = new Set(selectedCategories);
  const sectionTypes = Object.values(ProposalSectionType);

  return sectionTypes.map((type) => {
    const mappedCategories = SECTION_CATEGORY_MAP[type] || [];
    const parts: string[] = [];

    for (const cat of mappedCategories) {
      if (!selectedSet.has(cat)) continue;
      const entry = analysisData[cat];
      if (!entry?.content) continue;

      const label = CATEGORY_LABELS[cat] || cat;
      parts.push(`## ${label}\n\n${entry.content}`);
    }

    return {
      type,
      content: parts.join("\n\n"),
    };
  });
}
