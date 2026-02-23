import { describe, it, expect } from "vitest";
import { detectSourceType, type SourceTypeFilter } from "~/lib/utils/source-type";

/**
 * useSourceFilter 훅의 핵심 필터링/카운트 알고리즘 검증
 *
 * React 훅 자체를 테스트하는 것이 아니라, 훅 내부의 순수 로직을 추출하여 검증한다.
 * - 소스 타입 필터링: detectSourceType 기반 배열 필터
 * - 텍스트 검색: title/titleKo/summaryKo 기반 부분 일치
 * - 타입별 개수 집계: 전체 items 기준 카운트
 *
 * 참조: app/lib/hooks/use-source-filter.ts
 */

interface FilterableSource {
  title: string;
  titleKo: string | null;
  summaryKo: string | null;
  url: string;
}

// useSourceFilter 내부 필터 로직 재현 (use-source-filter.ts:19-38)
function filterSources<T extends FilterableSource>(
  items: T[],
  sourceTypeFilter: SourceTypeFilter,
  searchQuery: string
): T[] {
  let result = items;

  if (sourceTypeFilter !== "all") {
    result = result.filter(
      (item) => detectSourceType(item.url) === sourceTypeFilter
    );
  }

  const q = searchQuery.trim().toLowerCase();
  if (q) {
    result = result.filter((item) => {
      const title = (item.title || "").toLowerCase();
      const titleKo = (item.titleKo || "").toLowerCase();
      const summaryKo = (item.summaryKo || "").toLowerCase();
      return (
        title.includes(q) || titleKo.includes(q) || summaryKo.includes(q)
      );
    });
  }

  return result;
}

// useSourceFilter 내부 카운트 로직 재현 (use-source-filter.ts:42-49)
function countBySourceType<T extends FilterableSource>(
  items: T[]
): Record<SourceTypeFilter, number> {
  const map: Record<string, number> = { all: items.length };
  for (const item of items) {
    const t = detectSourceType(item.url);
    map[t] = (map[t] || 0) + 1;
  }
  return map as Record<SourceTypeFilter, number>;
}

// 테스트 데이터
const MOCK_SOURCES: FilterableSource[] = [
  {
    title: "AI Trends 2026",
    titleKo: "AI 트렌드 2026",
    summaryKo: "인공지능 산업 동향 분석",
    url: "https://example.com/ai-trends",
  },
  {
    title: "YouTube: AI Future",
    titleKo: "유튜브: AI 미래",
    summaryKo: "AI 발전 방향 영상",
    url: "https://www.youtube.com/watch?v=abc123",
  },
  {
    title: "Market Report",
    titleKo: "시장 보고서",
    summaryKo: "2026년 시장 분석 PDF 보고서",
    url: "https://example.com/report.pdf",
  },
  {
    title: "Direct Input",
    titleKo: "직접 입력",
    summaryKo: "사용자가 직접 입력한 텍스트",
    url: "text://직접 입력한 내용",
  },
  {
    title: "Another Web Article",
    titleKo: "또 다른 웹 기사",
    summaryKo: "블록체인 기술 동향",
    url: "https://example.com/blockchain",
  },
];

describe("filterSources — 소스 타입 필터링", () => {
  it("all → 모든 소스 반환", () => {
    const result = filterSources(MOCK_SOURCES, "all", "");
    expect(result).toHaveLength(5);
  });

  it("web → 웹 소스만 반환", () => {
    const result = filterSources(MOCK_SOURCES, "web", "");
    expect(result).toHaveLength(2);
    expect(result.every((s) => detectSourceType(s.url) === "web")).toBe(true);
  });

  it("youtube → 유튜브 소스만 반환", () => {
    const result = filterSources(MOCK_SOURCES, "youtube", "");
    expect(result).toHaveLength(1);
    expect(result[0].url).toContain("youtube.com");
  });

  it("pdf → PDF 소스만 반환", () => {
    const result = filterSources(MOCK_SOURCES, "pdf", "");
    expect(result).toHaveLength(1);
    expect(result[0].url).toContain(".pdf");
  });

  it("text → 텍스트 소스만 반환", () => {
    const result = filterSources(MOCK_SOURCES, "text", "");
    expect(result).toHaveLength(1);
    expect(result[0].url.startsWith("text://")).toBe(true);
  });
});

describe("filterSources — 텍스트 검색", () => {
  it("영문 title 검색", () => {
    const result = filterSources(MOCK_SOURCES, "all", "AI Trends");
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("AI Trends 2026");
  });

  it("한국어 titleKo 검색", () => {
    const result = filterSources(MOCK_SOURCES, "all", "시장 보고서");
    expect(result).toHaveLength(1);
    expect(result[0].titleKo).toBe("시장 보고서");
  });

  it("한국어 summaryKo 검색", () => {
    const result = filterSources(MOCK_SOURCES, "all", "블록체인");
    expect(result).toHaveLength(1);
    expect(result[0].summaryKo).toContain("블록체인");
  });

  it("대소문자 구분 없이 검색", () => {
    const result = filterSources(MOCK_SOURCES, "all", "ai trends");
    expect(result).toHaveLength(1);
  });

  it("부분 일치 검색", () => {
    const result = filterSources(MOCK_SOURCES, "all", "AI");
    // "AI Trends 2026", "YouTube: AI Future" 두 제목에 AI 포함
    expect(result).toHaveLength(2);
  });

  it("검색어 앞뒤 공백은 무시", () => {
    const result = filterSources(MOCK_SOURCES, "all", "  AI Trends  ");
    expect(result).toHaveLength(1);
  });

  it("빈 검색어 → 필터 안 함 (전체 반환)", () => {
    const result = filterSources(MOCK_SOURCES, "all", "");
    expect(result).toHaveLength(5);
  });

  it("공백만 있는 검색어 → 필터 안 함", () => {
    const result = filterSources(MOCK_SOURCES, "all", "   ");
    expect(result).toHaveLength(5);
  });

  it("일치 없는 검색어 → 빈 배열", () => {
    const result = filterSources(MOCK_SOURCES, "all", "없는키워드xyz");
    expect(result).toHaveLength(0);
  });
});

describe("filterSources — 타입 필터 + 검색 조합", () => {
  it("web 타입 + AI 검색", () => {
    const result = filterSources(MOCK_SOURCES, "web", "AI");
    // web 소스 2개 중 "AI Trends 2026"만 AI 포함
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("AI Trends 2026");
  });

  it("youtube 타입 + 없는 검색어", () => {
    const result = filterSources(MOCK_SOURCES, "youtube", "blockchain");
    expect(result).toHaveLength(0);
  });

  it("pdf 타입 + 시장 검색", () => {
    const result = filterSources(MOCK_SOURCES, "pdf", "시장");
    expect(result).toHaveLength(1);
  });
});

describe("filterSources — null/빈 필드 처리", () => {
  it("titleKo가 null인 소스도 title 기반으로 검색 가능", () => {
    const sources: FilterableSource[] = [
      {
        title: "English Only",
        titleKo: null,
        summaryKo: null,
        url: "https://example.com",
      },
    ];
    const result = filterSources(sources, "all", "English");
    expect(result).toHaveLength(1);
  });

  it("모든 텍스트 필드가 null이어도 에러 없이 빈 배열 반환", () => {
    const sources: FilterableSource[] = [
      {
        title: "",
        titleKo: null,
        summaryKo: null,
        url: "https://example.com",
      },
    ];
    const result = filterSources(sources, "all", "search");
    expect(result).toHaveLength(0);
  });
});

describe("countBySourceType", () => {
  it("전체 개수와 타입별 개수를 올바르게 계산", () => {
    const counts = countBySourceType(MOCK_SOURCES);
    expect(counts.all).toBe(5);
    expect(counts.web).toBe(2);
    expect(counts.youtube).toBe(1);
    expect(counts.pdf).toBe(1);
    expect(counts.text).toBe(1);
  });

  it("빈 배열 → all: 0, 나머지 undefined", () => {
    const counts = countBySourceType([]);
    expect(counts.all).toBe(0);
    // 빈 배열이므로 다른 타입은 집계되지 않음
    expect(counts.web).toBeUndefined();
    expect(counts.youtube).toBeUndefined();
  });

  it("동일 타입만 있을 때", () => {
    const webOnly: FilterableSource[] = [
      { title: "A", titleKo: null, summaryKo: null, url: "https://a.com" },
      { title: "B", titleKo: null, summaryKo: null, url: "https://b.com" },
      { title: "C", titleKo: null, summaryKo: null, url: "https://c.com" },
    ];
    const counts = countBySourceType(webOnly);
    expect(counts.all).toBe(3);
    expect(counts.web).toBe(3);
    expect(counts.youtube).toBeUndefined();
  });
});
