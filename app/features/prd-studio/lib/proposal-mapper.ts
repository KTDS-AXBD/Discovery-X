/**
 * PRD → Proposal 섹션 매핑
 *
 * PRD 8섹션을 Proposal 10섹션으로 변환한다.
 * editedContent가 있으면 우선 사용, 없으면 generatedContent fallback.
 */

export const PRD_TO_PROPOSAL_MAP: Record<string, string[]> = {
  overview: ["summary", "background"],
  content: ["solution", "requirements"],
  hypothesis: ["background", "objectives"],
  target_market: ["target_users", "background"],
  target_customer: ["target_users"],
  value_proposition: ["objectives", "solution"],
  revenue_model: ["requirements", "timeline"],
  scenario: ["risks", "timeline"],
  mvp: ["solution", "requirements"],
  execution_plan: ["timeline", "risks"],
};

const PROPOSAL_SECTION_TYPES = [
  "overview",
  "content",
  "hypothesis",
  "target_market",
  "target_customer",
  "value_proposition",
  "revenue_model",
  "scenario",
  "mvp",
  "execution_plan",
] as const;

interface PrdSectionInput {
  generatedContent: string | null;
  editedContent: string | null;
}

export interface ProposalSectionOutput {
  type: string;
  content: string;
}

export function mapPrdToProposalSections(
  prdSections: Record<string, PrdSectionInput>,
): ProposalSectionOutput[] {
  return PROPOSAL_SECTION_TYPES.map((proposalType) => {
    const mappedPrdKeys = PRD_TO_PROPOSAL_MAP[proposalType] ?? [];
    const parts: string[] = [];

    for (const prdKey of mappedPrdKeys) {
      const section = prdSections[prdKey];
      if (!section) continue;
      const content = section.editedContent ?? section.generatedContent ?? "";
      if (content) {
        parts.push(content);
      }
    }

    return {
      type: proposalType,
      content: parts.join("\n\n---\n\n"),
    };
  });
}
