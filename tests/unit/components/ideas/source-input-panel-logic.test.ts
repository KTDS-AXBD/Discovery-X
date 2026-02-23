import { describe, it, expect } from "vitest";
import { detectSourceType, type SourceTypeFilter } from "~/lib/utils/source-type";

/**
 * SourceInputPanel 내부 순수 함수 로직 검증
 *
 * 컴포넌트 렌더링 없이, 패널 내부의 핵심 알고리즘을 재현하여 검증한다.
 * - 24h 필터 로직 (collectedAt 기반 시간 필터)
 * - 소스 타입 필터 + 텍스트 검색 (useSourceFilter와 유사하지만 24h 추가)
 * - 페이지네이션 로직 (PAGE_SIZE, totalPages, hasMore)
 * - 입력 파싱 로직 (줄바꿈 분리, 빈 줄 무시)
 * - 피드백 메시지 생성 로직
 * - availableCollected 필터 (이미 추가된 아이템 제외)
 *
 * 참조: app/components/ideas/SourceInputPanel.tsx
 */

interface RadarItem {
  id: string;
  title: string;
  titleKo: string | null;
  summaryKo: string | null;
  url: string;
  relevanceScore: number | null;
  status: string;
  collectedAt: number | string | null;
}

const PAGE_SIZE = 10;
const DAY_MS = 86400000;

// SourceInputPanel.tsx:137-162 필터 로직 재현
function filterItems(
  items: RadarItem[],
  show24h: boolean,
  sourceTypeFilter: SourceTypeFilter,
  searchQuery: string,
  nowSnapshot: number
): RadarItem[] {
  let result = items;

  if (show24h) {
    result = result.filter((item) => {
      if (!item.collectedAt) return false;
      const t = new Date(
        typeof item.collectedAt === "number"
          ? item.collectedAt * 1000
          : item.collectedAt
      ).getTime();
      return nowSnapshot - t < DAY_MS;
    });
  }

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

// SourceInputPanel.tsx:175-177 페이지네이션 로직 재현
function paginate(items: RadarItem[], page: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const paginatedItems = items.slice(0, page * PAGE_SIZE);
  const hasMore = paginatedItems.length < items.length;
  return { totalPages, paginatedItems, hasMore };
}

// SourceInputPanel.tsx:82-96 입력 파싱 로직 재현
function parseInput(inputValue: string): string[] {
  const trimmed = inputValue.trim();
  if (!trimmed) return [];
  return trimmed
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

// SourceInputPanel.tsx:70-79 피드백 메시지 로직 재현
function getFeedbackMessage(result: {
  created: number;
  error?: string;
}): { type: "success" | "error"; message: string } {
  if (result.error) {
    return { type: "error", message: result.error };
  }
  if (result.created > 0) {
    return { type: "success", message: `${result.created}개 소스 추가됨` };
  }
  return { type: "success", message: "중복된 소스입니다" };
}

// SourceInputPanel.tsx:180-184 availableCollected 로직 재현
function getAvailableCollected(
  items: RadarItem[],
  collectedItems: RadarItem[]
): RadarItem[] {
  const addedIds = new Set(items.map((i) => i.id));
  return collectedItems.filter((c) => !addedIds.has(c.id));
}

// 테스트 데이터
const NOW = new Date("2026-02-23T12:00:00Z").getTime();

const MOCK_ITEMS: RadarItem[] = [
  {
    id: "1",
    title: "Recent Article",
    titleKo: "최근 기사",
    summaryKo: "최근 수집된 기사",
    url: "https://example.com/recent",
    relevanceScore: 0.9,
    status: "active",
    collectedAt: Math.floor((NOW - 3600000) / 1000), // 1시간 전 (unix seconds)
  },
  {
    id: "2",
    title: "Old Article",
    titleKo: "오래된 기사",
    summaryKo: "2일 전 기사",
    url: "https://example.com/old",
    relevanceScore: 0.7,
    status: "active",
    collectedAt: Math.floor((NOW - 2 * DAY_MS) / 1000), // 2일 전
  },
  {
    id: "3",
    title: "YouTube Video",
    titleKo: "유튜브 영상",
    summaryKo: "AI 관련 영상",
    url: "https://www.youtube.com/watch?v=xyz",
    relevanceScore: 0.8,
    status: "active",
    collectedAt: Math.floor((NOW - 7200000) / 1000), // 2시간 전
  },
  {
    id: "4",
    title: "PDF Report",
    titleKo: "PDF 보고서",
    summaryKo: "시장 분석 보고서",
    url: "https://example.com/report.pdf",
    relevanceScore: 0.6,
    status: "active",
    collectedAt: null, // collectedAt 없음
  },
  {
    id: "5",
    title: "Text Input",
    titleKo: "직접 입력",
    summaryKo: "사용자 입력 텍스트",
    url: "text://직접 입력한 내용",
    relevanceScore: null,
    status: "active",
    collectedAt: new Date(NOW - 1800000).toISOString(), // 30분 전 (ISO string)
  },
];

describe("filterItems — 24h 필터", () => {
  it("show24h=false → 모든 아이템 반환", () => {
    const result = filterItems(MOCK_ITEMS, false, "all", "", NOW);
    expect(result).toHaveLength(5);
  });

  it("show24h=true → 24시간 이내 아이템만 반환", () => {
    const result = filterItems(MOCK_ITEMS, true, "all", "", NOW);
    // id=1 (1시간 전), id=3 (2시간 전), id=5 (30분 전) = 3개
    // id=2 (2일 전) 제외, id=4 (null) 제외
    expect(result).toHaveLength(3);
    const ids = result.map((r) => r.id);
    expect(ids).toContain("1");
    expect(ids).toContain("3");
    expect(ids).toContain("5");
  });

  it("show24h=true + collectedAt가 null → 제외", () => {
    const result = filterItems(MOCK_ITEMS, true, "all", "", NOW);
    expect(result.find((r) => r.id === "4")).toBeUndefined();
  });

  it("collectedAt가 ISO string이면 정상 파싱", () => {
    const result = filterItems(MOCK_ITEMS, true, "all", "", NOW);
    expect(result.find((r) => r.id === "5")).toBeDefined();
  });

  it("collectedAt가 unix seconds(number)이면 *1000으로 변환", () => {
    const result = filterItems(MOCK_ITEMS, true, "all", "", NOW);
    expect(result.find((r) => r.id === "1")).toBeDefined();
  });
});

describe("filterItems — 24h + 소스 타입 조합", () => {
  it("show24h=true + youtube → 24h 이내 유튜브만", () => {
    const result = filterItems(MOCK_ITEMS, true, "youtube", "", NOW);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("3");
  });

  it("show24h=true + web → 24h 이내 웹만", () => {
    const result = filterItems(MOCK_ITEMS, true, "web", "", NOW);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
  });

  it("show24h=true + text → 24h 이내 텍스트만", () => {
    const result = filterItems(MOCK_ITEMS, true, "text", "", NOW);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("5");
  });

  it("show24h=true + pdf → 24h 이내 PDF 없음 (null collectedAt)", () => {
    const result = filterItems(MOCK_ITEMS, true, "pdf", "", NOW);
    expect(result).toHaveLength(0);
  });
});

describe("filterItems — 24h + 검색 조합", () => {
  it("show24h=true + 검색어 'AI' → 24h 이내에서 AI 포함만", () => {
    const result = filterItems(MOCK_ITEMS, true, "all", "AI", NOW);
    // id=3 (유튜브, AI 관련 영상)만 summaryKo에 'AI' 포함
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("3");
  });
});

describe("paginate", () => {
  it("아이템 0개 → totalPages=1, hasMore=false", () => {
    const { totalPages, paginatedItems, hasMore } = paginate([], 1);
    expect(totalPages).toBe(1);
    expect(paginatedItems).toHaveLength(0);
    expect(hasMore).toBe(false);
  });

  it("아이템 5개, page=1 → 전부 반환, hasMore=false", () => {
    const { totalPages, paginatedItems, hasMore } = paginate(MOCK_ITEMS, 1);
    expect(totalPages).toBe(1);
    expect(paginatedItems).toHaveLength(5);
    expect(hasMore).toBe(false);
  });

  it("아이템 15개, page=1 → 10개만, hasMore=true", () => {
    const items = Array.from({ length: 15 }, (_, i) => ({
      ...MOCK_ITEMS[0],
      id: `item-${i}`,
    }));
    const { totalPages, paginatedItems, hasMore } = paginate(items, 1);
    expect(totalPages).toBe(2);
    expect(paginatedItems).toHaveLength(10);
    expect(hasMore).toBe(true);
  });

  it("아이템 15개, page=2 → 15개 전부, hasMore=false", () => {
    const items = Array.from({ length: 15 }, (_, i) => ({
      ...MOCK_ITEMS[0],
      id: `item-${i}`,
    }));
    const { totalPages, paginatedItems, hasMore } = paginate(items, 2);
    expect(totalPages).toBe(2);
    expect(paginatedItems).toHaveLength(15);
    expect(hasMore).toBe(false);
  });

  it("아이템 30개, page=1 → totalPages=3", () => {
    const items = Array.from({ length: 30 }, (_, i) => ({
      ...MOCK_ITEMS[0],
      id: `item-${i}`,
    }));
    const { totalPages } = paginate(items, 1);
    expect(totalPages).toBe(3);
  });

  it("정확히 PAGE_SIZE(10) 개일 때 hasMore=false", () => {
    const items = Array.from({ length: 10 }, (_, i) => ({
      ...MOCK_ITEMS[0],
      id: `item-${i}`,
    }));
    const { totalPages, hasMore } = paginate(items, 1);
    expect(totalPages).toBe(1);
    expect(hasMore).toBe(false);
  });
});

describe("parseInput", () => {
  it("빈 문자열 → 빈 배열", () => {
    expect(parseInput("")).toEqual([]);
  });

  it("공백만 → 빈 배열", () => {
    expect(parseInput("   ")).toEqual([]);
  });

  it("단일 URL → 1개 배열", () => {
    expect(parseInput("https://example.com")).toEqual([
      "https://example.com",
    ]);
  });

  it("줄바꿈으로 구분된 여러 URL → 각각 분리", () => {
    const input = "https://a.com\nhttps://b.com\nhttps://c.com";
    expect(parseInput(input)).toEqual([
      "https://a.com",
      "https://b.com",
      "https://c.com",
    ]);
  });

  it("빈 줄은 무시", () => {
    const input = "https://a.com\n\n\nhttps://b.com";
    expect(parseInput(input)).toEqual(["https://a.com", "https://b.com"]);
  });

  it("각 줄의 앞뒤 공백 제거", () => {
    const input = "  https://a.com  \n  https://b.com  ";
    expect(parseInput(input)).toEqual(["https://a.com", "https://b.com"]);
  });

  it("전체 입력의 앞뒤 공백 제거", () => {
    const input = "\n  https://a.com\n  ";
    expect(parseInput(input)).toEqual(["https://a.com"]);
  });
});

describe("getFeedbackMessage", () => {
  it("에러 있으면 error 타입", () => {
    const msg = getFeedbackMessage({ created: 0, error: "네트워크 에러" });
    expect(msg).toEqual({ type: "error", message: "네트워크 에러" });
  });

  it("created > 0 → success + N개 소스 추가됨", () => {
    const msg = getFeedbackMessage({ created: 3 });
    expect(msg).toEqual({ type: "success", message: "3개 소스 추가됨" });
  });

  it("created=1 → 1개 소스 추가됨", () => {
    const msg = getFeedbackMessage({ created: 1 });
    expect(msg).toEqual({ type: "success", message: "1개 소스 추가됨" });
  });

  it("created=0, 에러 없음 → 중복된 소스입니다", () => {
    const msg = getFeedbackMessage({ created: 0 });
    expect(msg).toEqual({ type: "success", message: "중복된 소스입니다" });
  });

  it("에러와 created 둘 다 있으면 에러 우선", () => {
    const msg = getFeedbackMessage({ created: 2, error: "부분 실패" });
    expect(msg).toEqual({ type: "error", message: "부분 실패" });
  });
});

describe("getAvailableCollected", () => {
  const collectedItems: RadarItem[] = [
    {
      id: "c1",
      title: "Collected 1",
      titleKo: null,
      summaryKo: null,
      url: "https://collected1.com",
      relevanceScore: null,
      status: "collected",
      collectedAt: null,
    },
    {
      id: "c2",
      title: "Collected 2",
      titleKo: null,
      summaryKo: null,
      url: "https://collected2.com",
      relevanceScore: null,
      status: "collected",
      collectedAt: null,
    },
    {
      id: "1", // items에 이미 존재하는 ID
      title: "Already Added",
      titleKo: null,
      summaryKo: null,
      url: "https://example.com/recent",
      relevanceScore: null,
      status: "collected",
      collectedAt: null,
    },
  ];

  it("이미 추가된 아이템은 제외", () => {
    const result = getAvailableCollected(MOCK_ITEMS, collectedItems);
    expect(result).toHaveLength(2);
    expect(result.find((r) => r.id === "1")).toBeUndefined();
  });

  it("items가 비어 있으면 모든 collected 반환", () => {
    const result = getAvailableCollected([], collectedItems);
    expect(result).toHaveLength(3);
  });

  it("collectedItems가 비어 있으면 빈 배열 반환", () => {
    const result = getAvailableCollected(MOCK_ITEMS, []);
    expect(result).toHaveLength(0);
  });

  it("중복 ID가 없으면 모든 collected 반환", () => {
    const nonOverlapping: RadarItem[] = [
      { ...collectedItems[0], id: "c1" },
      { ...collectedItems[1], id: "c2" },
    ];
    const result = getAvailableCollected(MOCK_ITEMS, nonOverlapping);
    expect(result).toHaveLength(2);
  });
});
