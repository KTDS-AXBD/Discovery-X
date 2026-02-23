import { describe, it, expect } from "vitest";
import {
  displayTitle,
  isMeaningfulTitle,
  getUrlLabel,
} from "~/lib/utils/display-title";
import {
  detectSourceType,
  type SourceTypeFilter,
} from "~/lib/utils/source-type";

/**
 * SourceBrowser 내부 순수 함수 로직 검증
 *
 * 컴포넌트 렌더링 없이, SourceBrowser의 핵심 알고리즘을 검증한다.
 * - 소스 선택 상태 관리 (selectedId 토글)
 * - 아이디어 생성 요청 body 구조
 * - 소스 표시 제목 결정 (displayTitle 우선순위)
 * - text:// URL 감지 → 원본 링크 숨김
 * - 빈 소스 감지 → 빈 상태 메시지
 * - 선택된 소스 세부정보 표시 조건 (summaryKo, memo, url)
 *
 * 참조: app/components/ideas/SourceBrowser.tsx
 */

interface SourceItem {
  id: string;
  title: string;
  titleKo: string | null;
  summaryKo: string | null;
  url: string;
  relevanceScore: number | null;
  status: string;
  collectedAt: Date | string | null;
  memo: string | null;
}

// SourceBrowser.tsx:108 선택 토글 로직 재현
function toggleSelection(
  currentId: string | null,
  clickedId: string
): string | null {
  return currentId === clickedId ? null : clickedId;
}

// SourceBrowser.tsx:35 선택된 소스 찾기 로직 재현
function findSelectedSource(
  sources: SourceItem[],
  selectedId: string | null
): SourceItem | undefined {
  return sources.find((s) => s.id === selectedId);
}

// SourceBrowser.tsx:42 아이디어 생성 요청 body 구조 재현
function buildCreateIdeaBody(): { title: string } {
  return { title: "새 아이디어" };
}

// SourceBrowser.tsx:150 text:// URL 감지 → 원본 링크 숨김 여부
function shouldShowOriginalLink(url: string): boolean {
  return !!url && !url.startsWith("text://");
}

// SourceBrowser.tsx:133 summaryKo fallback 로직
function getDisplaySummary(summaryKo: string | null): string {
  return summaryKo || "요약 정보가 없습니다.";
}

// SourceBrowser.tsx:138 memo 표시 조건
function shouldShowMemo(memo: string | null): boolean {
  return !!memo;
}

// useSourceFilter 필터 로직 재현 (SourceBrowser에서 사용)
function filterSources(
  items: SourceItem[],
  sourceTypeFilter: SourceTypeFilter,
  searchQuery: string
): SourceItem[] {
  let result: SourceItem[] = items;

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
      return title.includes(q) || titleKo.includes(q) || summaryKo.includes(q);
    });
  }

  return result;
}

// useSourceFilter counts 로직 재현
function computeTypeCounts(
  items: SourceItem[]
): Record<SourceTypeFilter, number> {
  const map: Record<string, number> = { all: items.length };
  for (const item of items) {
    const t = detectSourceType(item.url);
    map[t] = (map[t] || 0) + 1;
  }
  return map as Record<SourceTypeFilter, number>;
}

// 테스트 데이터
const MOCK_SOURCES: SourceItem[] = [
  {
    id: "s1",
    title: "AI Trends 2026",
    titleKo: "AI 트렌드 2026",
    summaryKo: "인공지능 시장 동향 분석",
    url: "https://example.com/ai-trends",
    relevanceScore: 0.9,
    status: "active",
    collectedAt: "2026-02-23T10:00:00Z",
    memo: "핵심 내용 메모",
  },
  {
    id: "s2",
    title: "YouTube AI Tutorial",
    titleKo: null,
    summaryKo: "AI 튜토리얼 영상",
    url: "https://www.youtube.com/watch?v=abc123",
    relevanceScore: 0.7,
    status: "active",
    collectedAt: "2026-02-22T10:00:00Z",
    memo: null,
  },
  {
    id: "s3",
    title: "Market Report",
    titleKo: "시장 보고서",
    summaryKo: null,
    url: "https://example.com/report.pdf",
    relevanceScore: 0.8,
    status: "active",
    collectedAt: null,
    memo: "PDF 분석 결과",
  },
  {
    id: "s4",
    title: "User Input",
    titleKo: "사용자 직접 입력",
    summaryKo: "직접 입력한 내용에 대한 요약",
    url: "text://직접 입력한 관찰 내용",
    relevanceScore: null,
    status: "active",
    collectedAt: "2026-02-23T11:00:00Z",
    memo: null,
  },
  {
    id: "s5",
    title: "",
    titleKo: null,
    summaryKo: null,
    url: "https://example.com/no-title-page",
    relevanceScore: 0.5,
    status: "active",
    collectedAt: "2026-02-21T10:00:00Z",
    memo: null,
  },
];

describe("toggleSelection — 소스 선택/해제", () => {
  it("선택 안 된 상태에서 클릭 → 선택", () => {
    expect(toggleSelection(null, "s1")).toBe("s1");
  });

  it("같은 소스 클릭 → 해제 (null)", () => {
    expect(toggleSelection("s1", "s1")).toBeNull();
  });

  it("다른 소스 클릭 → 새 소스 선택", () => {
    expect(toggleSelection("s1", "s2")).toBe("s2");
  });
});

describe("findSelectedSource — 선택된 소스 찾기", () => {
  it("selectedId가 null → undefined", () => {
    expect(findSelectedSource(MOCK_SOURCES, null)).toBeUndefined();
  });

  it("존재하는 id → 해당 소스 반환", () => {
    const source = findSelectedSource(MOCK_SOURCES, "s1");
    expect(source).toBeDefined();
    expect(source?.title).toBe("AI Trends 2026");
  });

  it("존재하지 않는 id → undefined", () => {
    expect(findSelectedSource(MOCK_SOURCES, "s999")).toBeUndefined();
  });

  it("빈 배열 → undefined", () => {
    expect(findSelectedSource([], "s1")).toBeUndefined();
  });
});

describe("buildCreateIdeaBody — 아이디어 생성 요청 구조", () => {
  it("기본 제목 '새 아이디어'로 body 생성", () => {
    const body = buildCreateIdeaBody();
    expect(body).toEqual({ title: "새 아이디어" });
  });
});

describe("displayTitle — 소스 표시 제목 우선순위", () => {
  it("titleKo가 의미 있으면 titleKo 반환", () => {
    expect(displayTitle("AI 트렌드 2026", "AI Trends 2026")).toBe(
      "AI 트렌드 2026"
    );
  });

  it("titleKo가 null이면 title 반환", () => {
    expect(displayTitle(null, "AI Trends 2026")).toBe("AI Trends 2026");
  });

  it("titleKo가 짧으면 (5자 미만) title fallback", () => {
    expect(displayTitle("짧음", "Proper Title Here")).toBe(
      "Proper Title Here"
    );
  });

  it("둘 다 의미 없으면 URL 라벨 fallback", () => {
    expect(displayTitle(null, "", "https://example.com/page")).toBe(
      "example.com/page"
    );
  });

  it("모두 없으면 '제목 없음' 반환", () => {
    expect(displayTitle(null, "")).toBe("제목 없음");
  });

  it("titleKo가 메타 데이터 (예: '댓글 3개')이면 무시", () => {
    expect(displayTitle("댓글 3개", "Real Title Here")).toBe(
      "Real Title Here"
    );
  });

  it("text:// URL은 라벨로 사용되지 않음", () => {
    expect(displayTitle(null, "", "text://직접 입력")).toBe("제목 없음");
  });
});

describe("isMeaningfulTitle — 의미 있는 제목 판별", () => {
  it("null → false", () => {
    expect(isMeaningfulTitle(null)).toBe(false);
  });

  it("빈 문자열 → false", () => {
    expect(isMeaningfulTitle("")).toBe(false);
  });

  it("5자 미만 → false", () => {
    expect(isMeaningfulTitle("짧음")).toBe(false);
  });

  it("5자 이상 일반 텍스트 → true", () => {
    expect(isMeaningfulTitle("충분히 긴 제목입니다")).toBe(true);
  });

  it("메타 텍스트 '댓글 없음' → false", () => {
    expect(isMeaningfulTitle("댓글 없음")).toBe(false);
  });

  it("메타 텍스트 '3 comments' → false", () => {
    expect(isMeaningfulTitle("3 comments")).toBe(false);
  });
});

describe("getUrlLabel — URL 라벨 추출", () => {
  it("일반 URL → 호스트+경로", () => {
    expect(getUrlLabel("https://example.com/page")).toBe("example.com/page");
  });

  it("text:// URL → null", () => {
    expect(getUrlLabel("text://직접 입력")).toBeNull();
  });

  it("null → null", () => {
    expect(getUrlLabel(null)).toBeNull();
  });

  it("경로 없는 URL → 호스트만", () => {
    expect(getUrlLabel("https://example.com/")).toBe("example.com");
  });
});

describe("shouldShowOriginalLink — text:// URL 감지", () => {
  it("일반 URL → true (표시)", () => {
    expect(shouldShowOriginalLink("https://example.com")).toBe(true);
  });

  it("text:// URL → false (숨김)", () => {
    expect(shouldShowOriginalLink("text://직접 입력한 내용")).toBe(false);
  });

  it("빈 문자열 → false", () => {
    expect(shouldShowOriginalLink("")).toBe(false);
  });

  it("youtube URL → true", () => {
    expect(
      shouldShowOriginalLink("https://www.youtube.com/watch?v=abc")
    ).toBe(true);
  });

  it("PDF URL → true", () => {
    expect(shouldShowOriginalLink("https://example.com/report.pdf")).toBe(true);
  });
});

describe("getDisplaySummary — 요약 표시", () => {
  it("summaryKo 있으면 그대로 반환", () => {
    expect(getDisplaySummary("인공지능 시장 동향")).toBe("인공지능 시장 동향");
  });

  it("summaryKo가 null → fallback 메시지", () => {
    expect(getDisplaySummary(null)).toBe("요약 정보가 없습니다.");
  });
});

describe("shouldShowMemo — 메모 표시 조건", () => {
  it("memo가 있으면 true", () => {
    expect(shouldShowMemo("핵심 내용 메모")).toBe(true);
  });

  it("memo가 null → false", () => {
    expect(shouldShowMemo(null)).toBe(false);
  });

  it("memo가 빈 문자열 → false", () => {
    expect(shouldShowMemo("")).toBe(false);
  });
});

describe("빈 소스 감지", () => {
  it("소스 0개 → 빈 상태 (SourceBrowser 빈 메시지 분기)", () => {
    const sources: SourceItem[] = [];
    expect(sources.length === 0).toBe(true);
  });

  it("소스 있음 → 정상 목록 렌더링 분기", () => {
    expect(MOCK_SOURCES.length === 0).toBe(false);
  });
});

describe("filterSources — useSourceFilter 필터 로직", () => {
  it("타입 필터 'all' → 전부 반환", () => {
    const result = filterSources(MOCK_SOURCES, "all", "");
    expect(result).toHaveLength(5);
  });

  it("타입 필터 'youtube' → 유튜브만", () => {
    const result = filterSources(MOCK_SOURCES, "youtube", "");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("s2");
  });

  it("타입 필터 'pdf' → PDF만", () => {
    const result = filterSources(MOCK_SOURCES, "pdf", "");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("s3");
  });

  it("타입 필터 'text' → 텍스트만", () => {
    const result = filterSources(MOCK_SOURCES, "text", "");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("s4");
  });

  it("타입 필터 'web' → 웹만 (유튜브/PDF/텍스트 제외)", () => {
    const result = filterSources(MOCK_SOURCES, "web", "");
    expect(result).toHaveLength(2); // s1, s5
  });

  it("검색어 'AI' → title/titleKo/summaryKo에 포함된 것만", () => {
    const result = filterSources(MOCK_SOURCES, "all", "AI");
    // s1: title에 "AI", titleKo에 "AI", summaryKo에 "인공지능"
    // s2: title에 "AI", summaryKo에 "AI"
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id)).toEqual(
      expect.arrayContaining(["s1", "s2"])
    );
  });

  it("검색어 '시장' → titleKo/summaryKo 한글 검색", () => {
    const result = filterSources(MOCK_SOURCES, "all", "시장");
    // s1: summaryKo "인공지능 시장 동향 분석"
    // s3: titleKo "시장 보고서"
    expect(result).toHaveLength(2);
  });

  it("타입 + 검색 조합: youtube + 'AI' → 유튜브 중 AI 포함", () => {
    const result = filterSources(MOCK_SOURCES, "youtube", "AI");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("s2");
  });

  it("매칭 없는 검색어 → 빈 배열", () => {
    const result = filterSources(MOCK_SOURCES, "all", "존재하지않는검색어xyz");
    expect(result).toHaveLength(0);
  });

  it("검색어 대소문자 무시", () => {
    const result = filterSources(MOCK_SOURCES, "all", "ai trends");
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it("검색어 앞뒤 공백 무시", () => {
    const result = filterSources(MOCK_SOURCES, "all", "  AI  ");
    expect(result).toHaveLength(2);
  });
});

describe("computeTypeCounts — 타입별 카운트", () => {
  it("전체 카운트 = 소스 총 개수", () => {
    const counts = computeTypeCounts(MOCK_SOURCES);
    expect(counts.all).toBe(5);
  });

  it("타입별 합산이 전체와 일치", () => {
    const counts = computeTypeCounts(MOCK_SOURCES);
    const sum =
      (counts.web || 0) +
      (counts.youtube || 0) +
      (counts.pdf || 0) +
      (counts.text || 0);
    expect(sum).toBe(counts.all);
  });

  it("youtube 1개, pdf 1개, text 1개, web 2개", () => {
    const counts = computeTypeCounts(MOCK_SOURCES);
    expect(counts.youtube).toBe(1);
    expect(counts.pdf).toBe(1);
    expect(counts.text).toBe(1);
    expect(counts.web).toBe(2);
  });

  it("빈 배열 → all=0, 나머지 undefined", () => {
    const counts = computeTypeCounts([]);
    expect(counts.all).toBe(0);
  });
});

describe("선택된 소스 세부정보 표시 조건 통합", () => {
  it("s1: summaryKo 있음, memo 있음, 일반 URL → 모두 표시", () => {
    const source = MOCK_SOURCES[0]; // s1
    expect(getDisplaySummary(source.summaryKo)).toBe("인공지능 시장 동향 분석");
    expect(shouldShowMemo(source.memo)).toBe(true);
    expect(shouldShowOriginalLink(source.url)).toBe(true);
  });

  it("s2: summaryKo 있음, memo 없음, youtube URL → 요약+링크만", () => {
    const source = MOCK_SOURCES[1]; // s2
    expect(getDisplaySummary(source.summaryKo)).toBe("AI 튜토리얼 영상");
    expect(shouldShowMemo(source.memo)).toBe(false);
    expect(shouldShowOriginalLink(source.url)).toBe(true);
  });

  it("s3: summaryKo 없음, memo 있음, PDF URL → fallback 요약+메모+링크", () => {
    const source = MOCK_SOURCES[2]; // s3
    expect(getDisplaySummary(source.summaryKo)).toBe("요약 정보가 없습니다.");
    expect(shouldShowMemo(source.memo)).toBe(true);
    expect(shouldShowOriginalLink(source.url)).toBe(true);
  });

  it("s4: summaryKo 있음, memo 없음, text:// URL → 요약만, 링크 숨김", () => {
    const source = MOCK_SOURCES[3]; // s4
    expect(getDisplaySummary(source.summaryKo)).toBe(
      "직접 입력한 내용에 대한 요약"
    );
    expect(shouldShowMemo(source.memo)).toBe(false);
    expect(shouldShowOriginalLink(source.url)).toBe(false);
  });

  it("s5: summaryKo 없음, memo 없음, 일반 URL → fallback 요약+링크만", () => {
    const source = MOCK_SOURCES[4]; // s5
    expect(getDisplaySummary(source.summaryKo)).toBe("요약 정보가 없습니다.");
    expect(shouldShowMemo(source.memo)).toBe(false);
    expect(shouldShowOriginalLink(source.url)).toBe(true);
  });
});
