import { describe, it, expect } from "vitest";
import { buildSourceContext, buildMethodologySections, detectStaleSections } from "~/features/ideas/lib/section-builder";

describe("buildSourceContext", () => {
  it("returns '소스 없음' for empty array", () => {
    expect(buildSourceContext([])).toBe("소스 없음");
  });

  it("includes title and summary", () => {
    const result = buildSourceContext([
      { titleKo: "AI 시장", summaryKo: "AI 시장이 성장 중" },
    ]);
    expect(result).toContain("AI 시장");
    expect(result).toContain("요약: AI 시장이 성장 중");
  });

  it("includes keyPoints when available", () => {
    const result = buildSourceContext([
      {
        titleKo: "테스트",
        keyPoints: ["포인트 1", "포인트 2", "포인트 3"],
      },
    ]);
    expect(result).toContain("핵심 포인트:");
    expect(result).toContain("1. 포인트 1");
    expect(result).toContain("2. 포인트 2");
    expect(result).toContain("3. 포인트 3");
  });

  it("includes memo when available", () => {
    const result = buildSourceContext([
      { titleKo: "테스트", memo: "내 메모" },
    ]);
    expect(result).toContain("메모: 내 메모");
  });

  it("includes URL (filters out text:// URLs)", () => {
    const result1 = buildSourceContext([
      { titleKo: "테스트", url: "https://example.com" },
    ]);
    expect(result1).toContain("(https://example.com)");

    const result2 = buildSourceContext([
      { titleKo: "테스트", url: "text://abc123" },
    ]);
    expect(result2).not.toContain("text://");
  });

  it("falls back to title when titleKo is missing", () => {
    const result = buildSourceContext([
      { title: "English Title", summaryKo: "한국어 요약" },
    ]);
    expect(result).toContain("English Title");
  });

  it("falls back to summary when summaryKo is missing", () => {
    const result = buildSourceContext([
      { titleKo: "테스트", summary: "English summary" },
    ]);
    expect(result).toContain("요약: English summary");
  });

  it("handles multiple sources with numbered headers", () => {
    const result = buildSourceContext([
      { titleKo: "소스 A" },
      { titleKo: "소스 B" },
    ]);
    expect(result).toContain("소스 1: 소스 A");
    expect(result).toContain("소스 2: 소스 B");
  });

  it("handles all fields together", () => {
    const result = buildSourceContext([
      {
        titleKo: "종합 테스트",
        summary: "EN summary",
        summaryKo: "KO 요약",
        keyPoints: ["KP1", "KP2"],
        memo: "테스트 메모",
        url: "https://test.com",
      },
    ]);
    expect(result).toContain("종합 테스트");
    expect(result).toContain("(https://test.com)");
    expect(result).toContain("요약: KO 요약"); // summaryKo preferred
    expect(result).toContain("1. KP1");
    expect(result).toContain("2. KP2");
    expect(result).toContain("메모: 테스트 메모");
  });

  it("skips empty/null fields gracefully", () => {
    const result = buildSourceContext([
      {
        titleKo: "최소 데이터",
        summary: null,
        summaryKo: null,
        keyPoints: null as unknown as string[],
        memo: null,
        url: null,
      },
    ]);
    expect(result).toContain("최소 데이터");
    expect(result).not.toContain("요약:");
    expect(result).not.toContain("핵심 포인트:");
    expect(result).not.toContain("메모:");
  });
});

describe("buildMethodologySections", () => {
  it("returns null sections for empty idea", () => {
    const sections = buildMethodologySections({
      type: "idea",
      idea: { analysisData: null },
      sources: [],
    });
    const values = Object.values(sections);
    expect(values.every((v) => v === null)).toBe(true);
  });

  it("populates sections from analysisData", () => {
    const sections = buildMethodologySections({
      type: "idea",
      idea: {
        analysisData: {
          market_research: { title: "시장 조사", content: "시장 분석 결과" },
        },
      },
      sources: [],
    });
    expect(sections.market_research).not.toBeNull();
    expect(sections.market_research?.content).toBe("시장 분석 결과");
  });
});

describe("detectStaleSections", () => {
  it("detects stale when sourceIds differ", () => {
    const sections = {
      market_research: {
        title: "시장 조사",
        content: "결과",
        sourceIds: ["a", "b"],
      },
    };
    const stale = detectStaleSections(sections, ["a", "b", "c"]);
    expect(stale.has("market_research")).toBe(true);
  });

  it("returns empty when sourceIds match", () => {
    const sections = {
      market_research: {
        title: "시장 조사",
        content: "결과",
        sourceIds: ["a", "b"],
      },
    };
    const stale = detectStaleSections(sections, ["a", "b"]);
    expect(stale.size).toBe(0);
  });
});
