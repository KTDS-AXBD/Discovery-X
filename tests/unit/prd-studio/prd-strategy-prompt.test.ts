import { describe, it, expect } from "vitest";
import { buildStrategyPrompt } from "~/features/prd-studio/lib/strategy-prompt";
import type { PrdSectionInput } from "~/features/prd-studio/lib/strategy-prompt";

describe("buildStrategyPrompt()", () => {
  const fullSections: PrdSectionInput[] = [
    { type: "summary", generatedContent: "AI 기반 HR SaaS 플랫폼", editedContent: null },
    { type: "background", generatedContent: "HR 시장의 디지털 전환", editedContent: null },
    { type: "objectives", generatedContent: "MAU 1만 달성", editedContent: null },
    { type: "target_users", generatedContent: "중소기업 HR 담당자", editedContent: null },
    { type: "requirements", generatedContent: "실시간 채용 공고 관리", editedContent: null },
    { type: "solution", generatedContent: "AI 매칭 알고리즘", editedContent: null },
    { type: "risks", generatedContent: "개인정보보호법 규제", editedContent: null },
    { type: "timeline", generatedContent: "MVP 3개월, 정식 6개월", editedContent: null },
  ];

  // T1: 8섹션 입력 시 프롬프트에 섹션 내용 포함
  it("T1: 8섹션 입력 — 모든 섹션 내용 포함", () => {
    const prompt = buildStrategyPrompt(fullSections);

    for (const s of fullSections) {
      expect(prompt).toContain(s.type);
      expect(prompt).toContain(s.generatedContent!);
    }
    // 6개 프레임워크 지시 포함
    expect(prompt).toContain('"swot"');
    expect(prompt).toContain('"leanCanvas"');
    expect(prompt).toContain('"jtbd"');
    expect(prompt).toContain('"competition"');
    expect(prompt).toContain('"marketSizing"');
    expect(prompt).toContain('"riskAssessment"');
  });

  // T2: editedContent 우선 — edited가 있으면 generated 대신 사용
  it("T2: editedContent 우선 사용", () => {
    const sections: PrdSectionInput[] = [
      { type: "summary", generatedContent: "원본 요약", editedContent: "수정된 요약" },
      { type: "background", generatedContent: "원본 배경", editedContent: null },
    ];
    const prompt = buildStrategyPrompt(sections);

    expect(prompt).toContain("수정된 요약");
    expect(prompt).not.toContain("원본 요약");
    expect(prompt).toContain("원본 배경");
  });

  // T3: 빈 섹션 처리 — null 섹션도 에러 없이 처리
  it("T3: null 섹션 — 에러 없이 (내용 없음) 처리", () => {
    const sections: PrdSectionInput[] = [
      { type: "summary", generatedContent: null, editedContent: null },
      { type: "background", generatedContent: "배경 내용", editedContent: null },
    ];
    const prompt = buildStrategyPrompt(sections);

    expect(prompt).toContain("(내용 없음)");
    expect(prompt).toContain("배경 내용");
  });
});
