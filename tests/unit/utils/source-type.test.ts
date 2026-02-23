import { describe, it, expect } from "vitest";
import {
  detectSourceType,
  detectContentCategory,
  CONTENT_CATEGORIES,
  SOURCE_TYPE_LABELS,
  type SourceTypeFilter,
  type ContentCategory,
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

  // 추가 엣지 케이스: 쿼리 파라미터, 프래그먼트, 혼합 대소문자
  it(".PDF 대문자 확장자 → pdf (case-insensitive)", () => {
    expect(detectSourceType("https://example.com/report.PDF")).toBe("pdf");
  });

  it("쿼리 파라미터가 있는 PDF URL → pdf", () => {
    expect(detectSourceType("https://example.com/pdf/report?page=1")).toBe(
      "pdf"
    );
  });

  it("http:// (비-HTTPS) URL → web", () => {
    expect(detectSourceType("http://example.com/article")).toBe("web");
  });

  it("공백만 있는 문자열 → web (falsy가 아닌 빈 콘텐츠)", () => {
    // " " 자체는 truthy이므로 URL 분석을 탐. youtube/pdf/text 아님 → web
    expect(detectSourceType("   ")).toBe("web");
  });

  it("youtube.com 임베드 URL → youtube", () => {
    expect(
      detectSourceType("https://www.youtube.com/embed/abc123")
    ).toBe("youtube");
  });

  it("PDF 확장자와 youtube 도메인이 동시에 있을 때 → text:// 우선순위 테스트", () => {
    // text:// 프로토콜이 최우선이므로
    expect(
      detectSourceType("text://youtube.com/file.pdf")
    ).toBe("text");
  });

  it(".pdf 중간에 포함된 파일명(확장자 아님) → pdf (/pdf 경로 포함)", () => {
    // "/pdf"가 URL에 포함되므로 pdf로 분류
    expect(detectSourceType("https://example.com/pdf-viewer/123")).toBe("pdf");
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

// ── 콘텐츠 카테고리 ──────────────────────────────────────────

describe("CONTENT_CATEGORIES", () => {
  it("5개 카테고리가 정의되어 있다", () => {
    expect(CONTENT_CATEGORIES).toHaveLength(5);
  });

  it("all이 첫 번째 항목이다", () => {
    expect(CONTENT_CATEGORIES[0].key).toBe("all");
  });

  it("모든 항목에 key와 label이 있다", () => {
    for (const cat of CONTENT_CATEGORIES) {
      expect(cat.key).toBeDefined();
      expect(cat.label).toBeDefined();
      expect(cat.label.length).toBeGreaterThan(0);
    }
  });
});

describe("detectContentCategory", () => {
  // AI & 자동화
  it("AI 키워드 포함 URL → ai_automation", () => {
    expect(detectContentCategory("https://example.com/ai-trends")).toBe("ai_automation");
  });

  it("로봇 키워드 포함 → ai_automation", () => {
    expect(detectContentCategory(null, "로봇 시장 분석")).toBe("ai_automation");
  });

  it("LLM 관련 → ai_automation", () => {
    expect(detectContentCategory("https://openai.com/blog")).toBe("ai_automation");
  });

  it("titleKo에 자동화 → ai_automation", () => {
    expect(detectContentCategory("https://example.com", null, "산업 자동화 전망")).toBe("ai_automation");
  });

  // 비즈니스 & 투자
  it("시장 키워드 → biz_investment", () => {
    expect(detectContentCategory(null, "시장 규모 분석 보고서")).toBe("biz_investment");
  });

  it("mckinsey 도메인 → biz_investment", () => {
    expect(detectContentCategory("https://mckinsey.com/report")).toBe("biz_investment");
  });

  it("PDF URL → biz_investment", () => {
    expect(detectContentCategory("https://example.com/report.pdf")).toBe("biz_investment");
  });

  // 개발 도구
  it("github URL → dev_tools", () => {
    expect(detectContentCategory("https://github.com/org/repo")).toBe("dev_tools");
  });

  it("API 키워드 → dev_tools", () => {
    expect(detectContentCategory(null, "REST API Design Guide")).toBe("dev_tools");
  });

  // 웹 & 기술
  it("techcrunch URL → web_tech", () => {
    expect(detectContentCategory("https://techcrunch.com/article")).toBe("web_tech");
  });

  it("일반 URL → web_tech (기본값)", () => {
    expect(detectContentCategory("https://example.com/article")).toBe("web_tech");
  });

  // null/undefined 처리
  it("null URL + null title → web_tech", () => {
    expect(detectContentCategory(null, null, null)).toBe("web_tech");
  });

  it("빈 문자열 → web_tech", () => {
    expect(detectContentCategory("")).toBe("web_tech");
  });

  // 우선순위: AI > biz > dev > web
  it("AI 키워드가 비즈니스 키워드보다 우선", () => {
    expect(detectContentCategory(null, "AI 시장 투자 분석")).toBe("ai_automation");
  });

  it("비즈니스 키워드가 개발 키워드보다 우선", () => {
    expect(detectContentCategory(null, "투자 사업 API")).toBe("biz_investment");
  });
});
