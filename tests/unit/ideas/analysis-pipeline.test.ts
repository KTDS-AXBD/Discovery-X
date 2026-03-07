import { describe, it, expect } from "vitest";
import { ANALYSIS_CATEGORIES, PIPELINE_ORDER, CATEGORY_MAP } from "~/features/ideas/lib/analysis-prompts";

describe("analysis-prompts", () => {
  it("has 12 categories", () => {
    expect(ANALYSIS_CATEGORIES).toHaveLength(12);
  });

  it("pipeline order has 12 entries matching categories", () => {
    expect(PIPELINE_ORDER).toHaveLength(12);
    for (const key of PIPELINE_ORDER) {
      expect(CATEGORY_MAP.has(key)).toBe(true);
    }
  });

  it("all categories have 3 phases", () => {
    const phases = new Set(ANALYSIS_CATEGORIES.map((c) => c.phase));
    expect(phases).toEqual(new Set([1, 2, 3]));
  });

  it("phase 1 has 4 categories (foundation)", () => {
    const p1 = ANALYSIS_CATEGORIES.filter((c) => c.phase === 1);
    expect(p1).toHaveLength(4);
    expect(p1.map((c) => c.category)).toEqual([
      "market_research", "customer_research", "industry_example", "regulation",
    ]);
  });

  it("phase 2 has 4 categories (strategy)", () => {
    const p2 = ANALYSIS_CATEGORIES.filter((c) => c.phase === 2);
    expect(p2).toHaveLength(4);
    expect(p2.map((c) => c.category)).toEqual([
      "swot", "pestel", "value_chain", "differentiation",
    ]);
  });

  it("phase 3 has 4 categories (business model)", () => {
    const p3 = ANALYSIS_CATEGORIES.filter((c) => c.phase === 3);
    expect(p3).toHaveLength(4);
    expect(p3.map((c) => c.category)).toEqual([
      "bmc", "lean_canvas", "feasibility", "critical_thinking",
    ]);
  });

  it("all system prompts contain chain instruction", () => {
    for (const cat of ANALYSIS_CATEGORIES) {
      expect(cat.systemPrompt).toContain("이전 분석 참조");
      expect(cat.systemPrompt).toContain("핵심 인사이트");
    }
  });

  it("all system prompts contain common rules", () => {
    for (const cat of ANALYSIS_CATEGORIES) {
      expect(cat.systemPrompt).toContain("소스에 명시된 정보와 추론을 구분");
      expect(cat.systemPrompt).toContain("한국어로 작성");
    }
  });

  it("pipeline order matches phase sequence (1→2→3)", () => {
    let lastPhase = 0;
    for (const key of PIPELINE_ORDER) {
      const cat = CATEGORY_MAP.get(key)!;
      expect(cat.phase).toBeGreaterThanOrEqual(lastPhase);
      lastPhase = cat.phase;
    }
  });

  it("CATEGORY_MAP returns correct entries", () => {
    const market = CATEGORY_MAP.get("market_research");
    expect(market).toBeDefined();
    expect(market!.label).toBe("시장 조사");
    expect(market!.phase).toBe(1);

    const critical = CATEGORY_MAP.get("critical_thinking");
    expect(critical).toBeDefined();
    expect(critical!.label).toBe("비판적 사고");
    expect(critical!.phase).toBe(3);
  });
});

describe("extractInsightSummary (via analyzer internals)", () => {
  // We test the regex pattern that analyzer.ts uses
  const extractInsightSummary = (category: string, label: string, content: string): string => {
    const insightMatch = content.match(/###\s*핵심 인사이트[^\n]*\n([\s\S]*?)(?=\n###|\n##|$)/);
    if (insightMatch) {
      const lines = insightMatch[1]
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.startsWith("-") || l.startsWith("*"));
      if (lines.length > 0) {
        return `[${label}] ${lines.slice(0, 3).join(" | ")}`;
      }
    }
    const lines = content
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 20 && !l.startsWith("#") && !l.startsWith("---"));
    if (lines.length > 0) {
      return `[${label}] ${lines[0].slice(0, 150)}`;
    }
    return `[${label}] 분석 완료`;
  };

  it("extracts insight section correctly", () => {
    const content = `### 시장 규모
TAM은 약 10조원

### 핵심 인사이트 (3줄 요약)
- 시장은 연 15% 성장 중
- 주요 경쟁사 3개사가 시장의 70% 점유
- 진입 타이밍은 적절한 편`;

    const result = extractInsightSummary("market_research", "시장 조사", content);
    expect(result).toContain("[시장 조사]");
    expect(result).toContain("시장은 연 15% 성장 중");
    expect(result).toContain("주요 경쟁사 3개사");
  });

  it("falls back to first meaningful line when no insight section", () => {
    const content = `### 분석 결과
시장 규모는 약 10조원으로 추정되며 연 15% 성장 중입니다.
경쟁사는 3개사가 주도.`;

    const result = extractInsightSummary("market_research", "시장 조사", content);
    expect(result).toContain("[시장 조사]");
    expect(result).toContain("시장 규모는 약 10조원");
  });

  it("returns default when content is empty", () => {
    const result = extractInsightSummary("test", "테스트", "");
    expect(result).toBe("[테스트] 분석 완료");
  });
});
