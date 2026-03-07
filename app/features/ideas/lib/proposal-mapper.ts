/**
 * Maps analysis categories to proposal sections.
 * v2: AI synthesis — collects relevant analysis materials, then calls LLM to reshape into proposal format.
 */

import { ProposalSectionType } from "~/features/proposals/db/schema";
import { callLLM } from "~/lib/ai";
import type { FallbackContext } from "~/lib/ai";

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
  [ProposalSectionType.OVERVIEW]: ["bmc", "industry_example", "market_research"],
  [ProposalSectionType.CONTENT]: ["bmc", "value_chain", "lean_canvas"],
  [ProposalSectionType.HYPOTHESIS]: ["critical_thinking", "swot"],
  [ProposalSectionType.TARGET_MARKET]: ["market_research", "pestel"],
  [ProposalSectionType.TARGET_CUSTOMER]: ["customer_research"],
  [ProposalSectionType.VALUE_PROPOSITION]: ["differentiation", "value_chain", "lean_canvas"],
  [ProposalSectionType.REVENUE_MODEL]: ["feasibility", "bmc"],
  [ProposalSectionType.SCENARIO]: ["feasibility", "pestel", "critical_thinking"],
  [ProposalSectionType.MVP]: ["lean_canvas", "bmc", "customer_research"],
  [ProposalSectionType.EXECUTION_PLAN]: ["regulation", "industry_example", "feasibility"],
};

const SECTION_LABELS: Record<string, string> = {
  [ProposalSectionType.OVERVIEW]: "사업 개요",
  [ProposalSectionType.CONTENT]: "사업 내용",
  [ProposalSectionType.HYPOTHESIS]: "핵심 가설",
  [ProposalSectionType.TARGET_MARKET]: "타겟 시장",
  [ProposalSectionType.TARGET_CUSTOMER]: "타겟 고객",
  [ProposalSectionType.VALUE_PROPOSITION]: "가치 제안",
  [ProposalSectionType.REVENUE_MODEL]: "수익 모델",
  [ProposalSectionType.SCENARIO]: "시나리오 분석",
  [ProposalSectionType.MVP]: "MVP 설계",
  [ProposalSectionType.EXECUTION_PLAN]: "실행 계획",
};

/**
 * Collect raw analysis materials for a proposal section.
 */
function collectMaterials(
  analysisData: Record<string, AnalysisEntry>,
  sectionType: string,
  selectedCategories: string[],
): string {
  const selectedSet = new Set(selectedCategories);
  const mappedCategories = SECTION_CATEGORY_MAP[sectionType] || [];
  const parts: string[] = [];

  for (const cat of mappedCategories) {
    if (!selectedSet.has(cat)) continue;
    const entry = analysisData[cat];
    if (!entry?.content) continue;
    const label = CATEGORY_LABELS[cat] || cat;
    parts.push(`## ${label}\n\n${entry.content}`);
  }

  return parts.join("\n\n");
}

/**
 * Legacy mapper — mechanical copy (kept as fallback).
 */
export function mapAnalysisToSections(
  analysisData: Record<string, AnalysisEntry>,
  selectedCategories: string[],
): ProposalSectionContent[] {
  const sectionTypes = Object.values(ProposalSectionType);
  return sectionTypes.map((type) => ({
    type,
    content: collectMaterials(analysisData, type, selectedCategories),
  }));
}

/**
 * AI-synthesized proposal section generation.
 * Calls LLM per section to reshape analysis materials into proposal format.
 */
export async function synthesizeProposalSections(
  apiKey: string,
  modelId: string,
  ideaTitle: string,
  analysisData: Record<string, AnalysisEntry>,
  selectedCategories: string[],
  onProgress?: (sectionType: string, label: string) => void,
  aiCtx?: FallbackContext,
): Promise<ProposalSectionContent[]> {
  const sectionTypes = Object.values(ProposalSectionType);
  const results: ProposalSectionContent[] = [];

  for (const type of sectionTypes) {
    const materials = collectMaterials(analysisData, type, selectedCategories);
    const label = SECTION_LABELS[type] || type;

    onProgress?.(type, label);

    if (!materials.trim()) {
      results.push({ type, content: "" });
      continue;
    }

    try {
      const response = await callLLM(apiKey, {
        model: modelId,
        max_tokens: 1500,
        system: `당신은 사업 제안서 작성 전문가입니다.
아래 분석 자료를 바탕으로 "${label}" 섹션을 사업 제안서에 맞는 형태로 재구성하세요.

## 규칙
1. 분석 자료의 핵심 내용을 제안서에 적합한 톤과 구조로 변환하세요
2. 불필요한 반복을 제거하고 핵심만 남기세요
3. 실행 가능한 내용 중심으로 작성하세요
4. 마크다운 형식으로 작성하세요
5. 한국어로 작성하세요`,
        messages: [{
          role: "user",
          content: `# 아이디어: ${ideaTitle}\n\n# 작성할 섹션: ${label}\n\n# 분석 자료\n${materials}`,
        }],
      }, aiCtx);

      const text = response.content
        .filter((b) => b.type === "text")
        .map((b) => b.text || "")
        .join("");

      results.push({ type, content: text });
    } catch {
      // Fallback to raw materials
      results.push({ type, content: materials });
    }
  }

  return results;
}
