import { describe, it, expect } from "vitest";
import {
  detectSourceType,
  SOURCE_TYPE_LABELS,
  type SourceTypeFilter,
} from "~/lib/utils/source-type";

describe("detectSourceType", () => {
  // null/undefined/빈 문자열 → "web" 폴백
  it("null → web", () => {
    expect(detectSourceType(null)).toBe("web");
  });

  it("undefined → web", () => {
    expect(detectSourceType(undefined)).toBe("web");
  });

  it("빈 문자열 → web", () => {
    expect(detectSourceType("")).toBe("web");
  });

  // 일반 웹 URL
  it("일반 URL → web", () => {
    expect(detectSourceType("https://example.com")).toBe("web");
  });

  it("경로 포함 URL → web", () => {
    expect(detectSourceType("https://example.com/article")).toBe("web");
  });

  // text:// 프로토콜
  it("text:// 프로토콜 → text", () => {
    expect(detectSourceType("text://직접 입력 텍스트")).toBe("text");
  });

  it("TEXT:// 대문자 → text (case-insensitive)", () => {
    expect(detectSourceType("TEXT://대문자")).toBe("text");
  });

  // PDF 감지
  it(".pdf 확장자 → pdf", () => {
    expect(detectSourceType("https://example.com/document.pdf")).toBe("pdf");
  });

  it("/pdf 경로 포함 → pdf", () => {
    expect(detectSourceType("https://example.com/pdf/12345")).toBe("pdf");
  });

  // YouTube 감지
  it("youtube.com 동영상 → youtube", () => {
    expect(detectSourceType("https://www.youtube.com/watch?v=abc123")).toBe(
      "youtube"
    );
  });

  it("youtu.be 단축 URL → youtube", () => {
    expect(detectSourceType("https://youtu.be/abc123")).toBe("youtube");
  });

  it("youtube.com 재생목록 → youtube", () => {
    expect(
      detectSourceType("https://www.youtube.com/playlist?list=xxx")
    ).toBe("youtube");
  });

  // Edge cases
  it("youtube.com을 포함하는 악성 도메인도 youtube로 판별 (URL includes 기반 휴리스틱)", () => {
    // detectSourceType은 보안 함수가 아닌 UI 필터용 휴리스틱이므로
    // youtube.com이 포함된 문자열은 모두 "youtube"로 분류됨
    expect(detectSourceType("https://youtube.com.evil.com")).toBe("youtube");
  });

  it("text:// 프로토콜은 URL 내용과 무관하게 text 우선", () => {
    expect(detectSourceType("text://https://example.com")).toBe("text");
  });
});

describe("SOURCE_TYPE_LABELS", () => {
  it("모든 SourceTypeFilter 키에 한국어 레이블 존재", () => {
    const expectedKeys: SourceTypeFilter[] = [
      "all",
      "web",
      "youtube",
      "text",
      "pdf",
    ];
    for (const key of expectedKeys) {
      expect(SOURCE_TYPE_LABELS[key]).toBeDefined();
      expect(typeof SOURCE_TYPE_LABELS[key]).toBe("string");
      expect(SOURCE_TYPE_LABELS[key].length).toBeGreaterThan(0);
    }
  });

  it("각 레이블이 올바른 한국어 값", () => {
    expect(SOURCE_TYPE_LABELS.all).toBe("전체");
    expect(SOURCE_TYPE_LABELS.web).toBe("웹");
    expect(SOURCE_TYPE_LABELS.youtube).toBe("유튜브");
    expect(SOURCE_TYPE_LABELS.text).toBe("텍스트");
    expect(SOURCE_TYPE_LABELS.pdf).toBe("PDF");
  });
});
