import { describe, it, expect } from "vitest";
import { buildGtmPrompt } from "~/features/prd-studio/lib/gtm-prompt";
import type { PrdSectionInput } from "~/features/prd-studio/lib/strategy-prompt";
import type { StrategyResult } from "~/features/prd-studio/lib/strategy-parser";

const makeEmptyStrategy = (): StrategyResult => ({
  swot: { strengths: [], weaknesses: [], opportunities: [], threats: [], crossAnalysis: "" },
  leanCanvas: { problem: "", solution: "", keyMetrics: "", uniqueValueProp: "", unfairAdvantage: "", channels: "", customerSegments: "", costStructure: "", revenueStreams: "" },
  jtbd: { who: "", why: "", whatBefore: "", how: "", whatAfter: "", alternatives: "" },
  competition: { directCompetitors: [], indirectCompetitors: [], differentiation: "" },
  marketSizing: { tam: { value: "", description: "" }, sam: { value: "", description: "" }, som: { value: "", description: "" }, methodology: "", assumptions: [] },
  riskAssessment: { risks: [], overallRiskLevel: "medium", summary: "" },
});

describe("buildGtmPrompt()", () => {
  const sections: PrdSectionInput[] = [
    { type: "summary", generatedContent: "AI 기반 HR SaaS", editedContent: null },
    { type: "background", generatedContent: "HR 디지털 전환", editedContent: null },
    { type: "objectives", generatedContent: "MAU 1만 달성", editedContent: null },
    { type: "target_users", generatedContent: "중소기업 HR 담당자", editedContent: null },
    { type: "solution", generatedContent: "AI 매칭 알고리즘", editedContent: null },
    { type: "risks", generatedContent: "개인정보보호법", editedContent: null },
  ];

  const fullStrategy: StrategyResult = {
    swot: { strengths: ["기술력", "팀"], weaknesses: [], opportunities: ["시장 성장"], threats: [], crossAnalysis: "" },
    leanCanvas: { problem: "", solution: "", keyMetrics: "", uniqueValueProp: "AI 기반 즉시 매칭", unfairAdvantage: "", channels: "", customerSegments: "", costStructure: "", revenueStreams: "" },
    jtbd: { who: "중소기업 HR 담당자", why: "", whatBefore: "", how: "", whatAfter: "", alternatives: "" },
    competition: { directCompetitors: [], indirectCompetitors: [], differentiation: "AI 매칭 특화" },
    marketSizing: { tam: { value: "", description: "" }, sam: { value: "", description: "" }, som: { value: "200억원", description: "" }, methodology: "", assumptions: [] },
    riskAssessment: { risks: [], overallRiskLevel: "medium", summary: "" },
  };

  // T4: PRD + Strategy 입력 → 프롬프트 생성
  it("T4: PRD + Strategy → GTM 프롬프트 생성", () => {
    const prompt = buildGtmPrompt(sections, fullStrategy);

    // 핵심 섹션만 포함 (summary, target_users, solution, objectives)
    expect(prompt).toContain("AI 기반 HR SaaS");
    expect(prompt).toContain("중소기업 HR 담당자");
    expect(prompt).toContain("AI 매칭 알고리즘");
    expect(prompt).toContain("MAU 1만 달성");
    // 비핵심 섹션은 제외
    expect(prompt).not.toContain("HR 디지털 전환");
    expect(prompt).not.toContain("개인정보보호법");

    // 전략 요약 포함
    expect(prompt).toContain("기술력");
    expect(prompt).toContain("시장 성장");
    expect(prompt).toContain("AI 기반 즉시 매칭");
    expect(prompt).toContain("AI 매칭 특화");
    expect(prompt).toContain("200억원");

    // GTM 출력 스키마 포함
    expect(prompt).toContain('"beachheadSegment"');
    expect(prompt).toContain('"icp"');
    expect(prompt).toContain('"messaging"');
    expect(prompt).toContain('"channelStrategy"');
    expect(prompt).toContain('"launchPlan"');
  });

  // T5: Strategy 부분 결과 — swot만 있어도 동작
  it("T5: Strategy 부분 결과 — swot만 있어도 프롬프트 생성", () => {
    const partial = makeEmptyStrategy();
    partial.swot.strengths = ["유일한 강점"];

    const prompt = buildGtmPrompt(sections, partial);

    expect(prompt).toContain("유일한 강점");
    expect(prompt).toContain('"beachheadSegment"');
  });
});
