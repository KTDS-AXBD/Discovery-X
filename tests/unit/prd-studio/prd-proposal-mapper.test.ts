import { describe, it, expect } from "vitest";
import { mapPrdToProposalSections, PRD_TO_PROPOSAL_MAP } from "~/features/prd-studio/lib/proposal-mapper";

describe("mapPrdToProposalSections()", () => {
  const fullSections = {
    summary: { generatedContent: "## 프로젝트 요약\nSaaS 플랫폼 구축", editedContent: null },
    background: { generatedContent: "## 배경\nHR 시장 비효율", editedContent: null },
    objectives: { generatedContent: "## 목표\nMAU 1000 달성", editedContent: null },
    target_users: { generatedContent: "## 대상\nHR 담당자", editedContent: null },
    requirements: { generatedContent: "## 요구사항\nP0 5건", editedContent: null },
    solution: { generatedContent: "## 해결방안\nAI 자동화", editedContent: null },
    risks: { generatedContent: "## 리스크\n규제 리스크", editedContent: null },
    timeline: { generatedContent: "## 일정\n3개월 MVP", editedContent: null },
  };

  // T44: 8섹션 모두 있음 → 10개 proposal 섹션 매핑
  it("T44: 8섹션 → 10개 proposal 섹션 매핑", () => {
    const result = mapPrdToProposalSections(fullSections);

    expect(result).toHaveLength(10);
    const types = result.map((s) => s.type);
    expect(types).toContain("overview");
    expect(types).toContain("content");
    expect(types).toContain("hypothesis");
    expect(types).toContain("target_market");
    expect(types).toContain("target_customer");
    expect(types).toContain("value_proposition");
    expect(types).toContain("revenue_model");
    expect(types).toContain("scenario");
    expect(types).toContain("mvp");
    expect(types).toContain("execution_plan");
  });

  // T45: overview ← summary + background 내용 결합
  it("T45: overview ← summary + background 결합", () => {
    const result = mapPrdToProposalSections(fullSections);
    const overview = result.find((s) => s.type === "overview");

    expect(overview).toBeDefined();
    expect(overview!.content).toContain("프로젝트 요약");
    expect(overview!.content).toContain("배경");
  });

  // T46: 빈 섹션 → 해당 proposal 섹션도 빈 문자열
  it("T46: 빈 섹션 → 빈 proposal 섹션", () => {
    const emptySections = {
      summary: { generatedContent: null, editedContent: null },
      background: { generatedContent: null, editedContent: null },
      objectives: { generatedContent: null, editedContent: null },
      target_users: { generatedContent: null, editedContent: null },
      requirements: { generatedContent: null, editedContent: null },
      solution: { generatedContent: null, editedContent: null },
      risks: { generatedContent: null, editedContent: null },
      timeline: { generatedContent: null, editedContent: null },
    };
    const result = mapPrdToProposalSections(emptySections);

    for (const section of result) {
      expect(section.content).toBe("");
    }
  });

  // T47: editedContent 우선 (generatedContent fallback)
  it("T47: editedContent 우선", () => {
    const editedSections = {
      ...fullSections,
      summary: { generatedContent: "원본 요약", editedContent: "수정된 요약" },
    };
    const result = mapPrdToProposalSections(editedSections);
    const overview = result.find((s) => s.type === "overview");

    expect(overview!.content).toContain("수정된 요약");
    expect(overview!.content).not.toContain("원본 요약");
  });

  // T48: PRD_TO_PROPOSAL_MAP 완전성 검증
  it("T48: PRD_TO_PROPOSAL_MAP — 10개 proposal 섹션 모두 매핑 정의됨", () => {
    const proposalTypes = ["overview", "content", "hypothesis", "target_market", "target_customer", "value_proposition", "revenue_model", "scenario", "mvp", "execution_plan"];

    for (const type of proposalTypes) {
      expect(PRD_TO_PROPOSAL_MAP[type]).toBeDefined();
      expect(PRD_TO_PROPOSAL_MAP[type].length).toBeGreaterThan(0);
    }
  });
});
