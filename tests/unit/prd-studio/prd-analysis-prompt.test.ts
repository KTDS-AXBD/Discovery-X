import { describe, it, expect } from "vitest";
import { buildPrdAnalysisPrompt } from "~/features/prd-studio/lib/analysis-prompt";

describe("buildPrdAnalysisPrompt()", () => {
  const singleSource = [
    { title: "SaaS 시장 동향 2026", summary: "클라우드 기반 SaaS 시장이 연 15% 성장 중", url: "https://example.com/saas" },
  ];

  const multipleSources = [
    { title: "SaaS 시장 동향", summary: "클라우드 SaaS 시장 연 15% 성장", url: "https://example.com/1" },
    { title: "HR Tech 트렌드", summary: "AI 기반 채용 시스템 도입 가속화", url: "https://example.com/2" },
    { title: "경쟁사 분석", summary: "Workday, BambooHR 등 주요 플레이어", url: "https://example.com/3" },
    { title: "규제 환경 보고서", summary: "개인정보보호법 강화 추세", url: "https://example.com/4" },
    { title: "사용자 인터뷰 결과", summary: "HR 담당자 10명 FGI 결과", url: "https://example.com/5" },
  ];

  // T28: 소스 1개 → 프롬프트에 소스 제목/요약 포함
  it("T28: 소스 1개 — 제목과 요약 포함", () => {
    const prompt = buildPrdAnalysisPrompt(singleSource);

    expect(prompt).toContain("SaaS 시장 동향 2026");
    expect(prompt).toContain("클라우드 기반 SaaS 시장이 연 15% 성장 중");
    expect(prompt).toContain("https://example.com/saas");
  });

  // T29: 소스 5개 → 모든 소스 컨텍스트 포함, 번호 매김
  it("T29: 소스 5개 — 모든 소스 포함 + 번호 매김", () => {
    const prompt = buildPrdAnalysisPrompt(multipleSources);

    for (const source of multipleSources) {
      expect(prompt).toContain(source.title);
      expect(prompt).toContain(source.summary);
    }
    // 번호 매김 확인
    expect(prompt).toContain("소스 1");
    expect(prompt).toContain("소스 5");
  });

  // T30: 소스에 한글/영문 혼합 → 정상 처리
  it("T30: 한글/영문 혼합 소스", () => {
    const mixedSources = [
      { title: "AI Market Report 2026", summary: "글로벌 AI 시장 규모 $500B 전망", url: "https://example.com" },
    ];
    const prompt = buildPrdAnalysisPrompt(mixedSources);

    expect(prompt).toContain("AI Market Report 2026");
    expect(prompt).toContain("글로벌 AI 시장 규모 $500B 전망");
  });

  // T31: 출력 JSON 스키마 지시 포함 확인
  it("T31: JSON 출력 스키마 지시 포함", () => {
    const prompt = buildPrdAnalysisPrompt(singleSource);

    expect(prompt).toContain('"prd"');
    expect(prompt).toContain('"sections"');
    expect(prompt).toContain('"review"');
    expect(prompt).toContain('"verdict"');
    expect(prompt).toContain('"scorecard"');
    expect(prompt).toContain('"feedbackItems"');
  });

  // T32: 8개 섹션 타입 모두 지시에 포함 확인
  it("T32: 8개 섹션 타입 전체 포함", () => {
    const prompt = buildPrdAnalysisPrompt(singleSource);
    const sectionTypes = ["summary", "background", "objectives", "target_users", "requirements", "solution", "risks", "timeline"];

    for (const type of sectionTypes) {
      expect(prompt).toContain(`"${type}"`);
    }
  });

  // T33: 검토 기준 8개 항목 포함 확인
  it("T33: 검토 기준 8개 항목 포함", () => {
    const prompt = buildPrdAnalysisPrompt(singleSource);
    const criteria = ["문제 정의", "대상 사용자", "목표", "요구사항", "해결방안", "리스크", "일정", "일관성"];

    for (const c of criteria) {
      expect(prompt).toContain(c);
    }
  });
});
