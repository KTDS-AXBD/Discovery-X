import { describe, it, expect } from "vitest";
import {
  isMeaningfulTitle,
  getUrlLabel,
  displayTitle,
} from "~/lib/utils/display-title";

describe("isMeaningfulTitle", () => {
  it("null → false", () => {
    expect(isMeaningfulTitle(null)).toBe(false);
  });

  it("빈 문자열 → false", () => {
    expect(isMeaningfulTitle("")).toBe(false);
  });

  it("5자 미만 → false", () => {
    expect(isMeaningfulTitle("abcd")).toBe(false);
    expect(isMeaningfulTitle("    ")).toBe(false);
  });

  it("5자 이상 일반 제목 → true", () => {
    expect(isMeaningfulTitle("AI 트렌드 분석")).toBe(true);
    expect(isMeaningfulTitle("Hello World")).toBe(true);
  });

  it("메타 패턴 '댓글 N개' → false", () => {
    expect(isMeaningfulTitle("댓글 3개")).toBe(false);
    expect(isMeaningfulTitle("댓글 100개")).toBe(false);
    expect(isMeaningfulTitle("댓글  3개")).toBe(false);
  });

  it("메타 패턴 '댓글 없음' → false", () => {
    expect(isMeaningfulTitle("댓글 없음")).toBe(false);
    expect(isMeaningfulTitle("댓글없음")).toBe(false);
  });

  it("메타 패턴 'N comments' → false", () => {
    expect(isMeaningfulTitle("5 comments")).toBe(false);
    expect(isMeaningfulTitle("1 comment")).toBe(false);
  });

  it("메타 패턴 'N points' → false", () => {
    expect(isMeaningfulTitle("100 points")).toBe(false);
    expect(isMeaningfulTitle("1 point")).toBe(false);
  });

  it("메타 패턴 'N개' → false", () => {
    expect(isMeaningfulTitle("10개")).toBe(false);
  });

  it("앞뒤 공백 포함 메타 패턴도 감지", () => {
    expect(isMeaningfulTitle("  댓글 3개  ")).toBe(false);
  });

  it("메타 패턴이 아닌 숫자 포함 제목 → true", () => {
    expect(isMeaningfulTitle("2026년 AI 동향")).toBe(true);
  });
});

describe("getUrlLabel", () => {
  it("null → null", () => {
    expect(getUrlLabel(null)).toBeNull();
  });

  it("undefined → null", () => {
    expect(getUrlLabel(undefined)).toBeNull();
  });

  it("text:// 프로토콜 → null", () => {
    expect(getUrlLabel("text://직접 입력")).toBeNull();
  });

  it("일반 URL → 호스트+경로", () => {
    const label = getUrlLabel("https://example.com/article/123");
    expect(label).toBe("example.com/article/123");
  });

  it("루트 경로만 있는 URL → 호스트만", () => {
    const label = getUrlLabel("https://example.com");
    expect(label).toBe("example.com");
  });

  it("루트 경로(/) → 호스트만", () => {
    const label = getUrlLabel("https://example.com/");
    expect(label).toBe("example.com");
  });

  it("긴 경로는 40자에서 잘림", () => {
    const longPath = "/a".repeat(30); // 60자
    const label = getUrlLabel(`https://example.com${longPath}`);
    expect(label).toBeDefined();
    // 호스트(example.com) + 경로(40자 이내)
    expect(label!.length).toBeLessThanOrEqual("example.com".length + 40);
  });

  it("잘못된 URL → null", () => {
    expect(getUrlLabel("not-a-url")).toBeNull();
  });
});

describe("displayTitle", () => {
  it("titleKo가 의미 있으면 titleKo 반환", () => {
    expect(displayTitle("AI 트렌드 분석", "AI Trend Analysis")).toBe(
      "AI 트렌드 분석"
    );
  });

  it("titleKo가 없으면 title 반환", () => {
    expect(displayTitle(null, "AI Trend Analysis")).toBe("AI Trend Analysis");
  });

  it("titleKo가 메타 패턴이면 title로 폴백", () => {
    expect(displayTitle("댓글 3개", "Actual Article Title")).toBe(
      "Actual Article Title"
    );
  });

  it("titleKo와 title 모두 의미 없으면 URL 라벨 사용", () => {
    expect(displayTitle(null, "", "https://example.com/article")).toBe(
      "example.com/article"
    );
  });

  it("모든 값이 없으면 '제목 없음' 반환", () => {
    expect(displayTitle(null, "")).toBe("제목 없음");
    expect(displayTitle(null, "", null)).toBe("제목 없음");
  });

  it("fallbackUrl이 text://이면 URL 라벨 없이 '제목 없음'", () => {
    expect(displayTitle(null, "", "text://직접 입력")).toBe("제목 없음");
  });

  it("titleKo 짧은 문자열(5자 미만)은 무시하고 title 사용", () => {
    expect(displayTitle("abc", "Valid Long Title")).toBe("Valid Long Title");
  });
});
