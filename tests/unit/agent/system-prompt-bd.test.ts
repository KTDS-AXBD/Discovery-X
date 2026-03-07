import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "~/features/chat/agent/system-prompt";

describe("BD PoC system-prompt sourceContext", () => {
  // U-04
  it("includes sourceContext fields when provided", () => {
    const prompt = buildSystemPrompt(null, {
      title: "AI 제조업 품질 검사",
      summaryKo: "AI 기반 품질 검사 시장이 급성장 중",
      url: "https://example.com/article",
      keyPoints: ["비전 AI 정확도 99.5%", "도입 비용 30% 감소"],
    });

    expect(prompt).toContain("AI 제조업 품질 검사");
    expect(prompt).toContain("AI 기반 품질 검사 시장이 급성장 중");
    expect(prompt).toContain("https://example.com/article");
    expect(prompt).toContain("비전 AI 정확도 99.5%");
    expect(prompt).toContain("도입 비용 30% 감소");
    expect(prompt).toContain("현재 소스 컨텍스트");
  });

  // U-05
  it("excludes source section when sourceContext is null", () => {
    const prompt = buildSystemPrompt(null, null);

    expect(prompt).not.toContain("현재 소스 컨텍스트");
    expect(prompt).toContain("Discovery-X의 AI Agent");
  });

  // U-06
  it("omits keyPoints section when keyPoints is empty", () => {
    const prompt = buildSystemPrompt(null, {
      title: "테스트 소스",
      summaryKo: "요약 텍스트",
    });

    expect(prompt).toContain("테스트 소스");
    expect(prompt).toContain("요약 텍스트");
    expect(prompt).not.toContain("핵심 포인트");
  });

  // U-07
  it("includes only url when other fields are missing", () => {
    const prompt = buildSystemPrompt(null, {
      url: "https://example.com/only-url",
    });

    expect(prompt).toContain("https://example.com/only-url");
    expect(prompt).toContain("현재 소스 컨텍스트");
    expect(prompt).toContain("N/A"); // title and summaryKo fallback
  });

  // U-08
  it("falls back to default when sourceContext is undefined", () => {
    const prompt = buildSystemPrompt(null, undefined);

    expect(prompt).not.toContain("현재 소스 컨텍스트");
    expect(prompt).toContain("Discovery-X의 AI Agent");
  });
});
