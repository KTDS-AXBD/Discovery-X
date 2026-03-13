import { describe, it, expect } from "vitest";
import { buildProposalSynthesisPrompt, PROPOSAL_SECTION_TYPES } from "~/features/prd-studio/lib/proposal-synthesis-prompt";

const MOCK_SECTIONS = [
  { type: "summary", generatedContent: "프로젝트 요약", editedContent: null },
  { type: "background", generatedContent: "배경", editedContent: "수정된 배경" },
  { type: "objectives", generatedContent: "목표", editedContent: null },
  { type: "target_users", generatedContent: "대상 사용자", editedContent: null },
  { type: "solution", generatedContent: "해결 방안", editedContent: null },
  { type: "requirements", generatedContent: "요구사항", editedContent: null },
  { type: "risks", generatedContent: "리스크", editedContent: null },
  { type: "timeline", generatedContent: "일정", editedContent: null },
];

describe("buildProposalSynthesisPrompt", () => {
  it("overview 섹션 프롬프트에 summary, background 포함", () => {
    const result = buildProposalSynthesisPrompt("overview", MOCK_SECTIONS, null, null);
    expect(result).toContain("프로젝트 요약");
    expect(result).toContain("수정된 배경");
    expect(result).toContain("사업 개요");
  });

  it("editedContent 우선 사용", () => {
    const result = buildProposalSynthesisPrompt("overview", MOCK_SECTIONS, null, null);
    expect(result).toContain("수정된 배경");
    expect(result).not.toContain("## PRD 관련 내용\n배경");
  });

  it("알 수 없는 proposalType은 빈 문자열 반환", () => {
    const result = buildProposalSynthesisPrompt("unknown_type", MOCK_SECTIONS, null, null);
    expect(result).toBe("");
  });

  it("PROPOSAL_SECTION_TYPES는 10개", () => {
    expect(PROPOSAL_SECTION_TYPES).toHaveLength(10);
  });
});
