import { describe, it, expect } from "vitest";

/**
 * IdeaCardGrid 내부 순수 함수 로직 검증
 *
 * getCompletedCount()와 getStatusBadge()는 컴포넌트 내부에서 export되지 않으므로,
 * 동일한 알고리즘을 재현하여 비즈니스 스펙을 검증한다.
 *
 * 참조: app/components/ideas/IdeaCardGrid.tsx:40-56
 */

const ANALYSIS_CATEGORIES = [
  "market_research",
  "customer_research",
  "critical_thinking",
  "bmc",
  "regulation",
  "feasibility",
] as const;

// IdeaCardGrid.tsx:40 getCompletedCount 동일 로직
function getCompletedCount(
  analysisData: Record<string, unknown> | null
): number {
  if (!analysisData) return 0;
  let count = 0;
  for (const key of ANALYSIS_CATEGORIES) {
    const entry = analysisData[key] as { content?: string } | undefined;
    if (entry?.content) count++;
  }
  if (analysisData.proposalCreated) count++;
  return count;
}

// IdeaCardGrid.tsx:52 getStatusBadge 동일 로직
function getStatusBadge(
  completed: number
): { label: string; variant: "success" | "warning" | "info" } {
  if (completed >= 7)
    return { label: `완료 ${completed}/7`, variant: "success" };
  if (completed >= 5)
    return { label: `검토 ${completed}/7`, variant: "warning" };
  return { label: `초안 ${completed}/7`, variant: "info" };
}

describe("getCompletedCount", () => {
  it("null → 0", () => {
    expect(getCompletedCount(null)).toBe(0);
  });

  it("빈 객체 → 0", () => {
    expect(getCompletedCount({})).toBe(0);
  });

  it("6개 카테고리 중 content가 있는 항목만 카운트", () => {
    const data: Record<string, unknown> = {
      market_research: { content: "시장 분석 내용" },
      customer_research: { content: "" }, // 빈 문자열 → falsy
      critical_thinking: { content: "비판적 사고 내용" },
      bmc: undefined,
      regulation: { content: "규제 내용" },
      feasibility: null,
    };
    expect(getCompletedCount(data)).toBe(3);
  });

  it("모든 6개 카테고리 + proposalCreated → 7", () => {
    const data: Record<string, unknown> = {
      market_research: { content: "O" },
      customer_research: { content: "O" },
      critical_thinking: { content: "O" },
      bmc: { content: "O" },
      regulation: { content: "O" },
      feasibility: { content: "O" },
      proposalCreated: true,
    };
    expect(getCompletedCount(data)).toBe(7);
  });

  it("proposalCreated만 있고 카테고리 없음 → 1", () => {
    const data: Record<string, unknown> = {
      proposalCreated: true,
    };
    expect(getCompletedCount(data)).toBe(1);
  });

  it("카테고리에 content 없는 객체는 카운트하지 않음", () => {
    const data: Record<string, unknown> = {
      market_research: { summary: "요약만 있음" }, // content 필드 없음
      customer_research: { content: "내용 있음" },
    };
    expect(getCompletedCount(data)).toBe(1);
  });

  it("관련 없는 키는 무시", () => {
    const data: Record<string, unknown> = {
      random_key: { content: "무시됨" },
      another_key: "무시됨",
      market_research: { content: "카운트됨" },
    };
    expect(getCompletedCount(data)).toBe(1);
  });

  it("proposalCreated가 falsy 값이면 카운트 안 함", () => {
    const data: Record<string, unknown> = {
      market_research: { content: "O" },
      proposalCreated: false,
    };
    expect(getCompletedCount(data)).toBe(1);
  });

  it("proposalCreated가 0이면 카운트 안 함", () => {
    const data: Record<string, unknown> = {
      proposalCreated: 0,
    };
    expect(getCompletedCount(data)).toBe(0);
  });

  it("proposalCreated가 문자열이면 카운트", () => {
    // truthy 값이면 카운트
    const data: Record<string, unknown> = {
      proposalCreated: "proposal-123",
    };
    expect(getCompletedCount(data)).toBe(1);
  });
});

describe("getStatusBadge", () => {
  it("0 → 초안 0/7 (info)", () => {
    expect(getStatusBadge(0)).toEqual({
      label: "초안 0/7",
      variant: "info",
    });
  });

  it("4 → 초안 4/7 (info)", () => {
    expect(getStatusBadge(4)).toEqual({
      label: "초안 4/7",
      variant: "info",
    });
  });

  it("5 → 검토 5/7 (warning)", () => {
    expect(getStatusBadge(5)).toEqual({
      label: "검토 5/7",
      variant: "warning",
    });
  });

  it("6 → 검토 6/7 (warning)", () => {
    expect(getStatusBadge(6)).toEqual({
      label: "검토 6/7",
      variant: "warning",
    });
  });

  it("7 → 완료 7/7 (success)", () => {
    expect(getStatusBadge(7)).toEqual({
      label: "완료 7/7",
      variant: "success",
    });
  });

  // 경계값 테스트: 7 초과도 success
  it("8 → 완료 8/7 (success) — 7 초과도 success 처리", () => {
    expect(getStatusBadge(8)).toEqual({
      label: "완료 8/7",
      variant: "success",
    });
  });
});

// ── IdeaCardGrid 추가 로직 ──────────────────────────────────────────

const DOT_COLORS = [
  "bg-violet-500", "bg-orange-500", "bg-blue-500", "bg-emerald-500",
  "bg-rose-500", "bg-amber-500", "bg-cyan-500", "bg-pink-500",
] as const;

interface IdeaItem {
  id: string;
  title: string;
  status: string;
  ownerId: string;
  analysisData: Record<string, unknown> | null;
  createdAt: string | number | null;
}

function separateIdeas(ideaList: IdeaItem[], userId: string) {
  return {
    myIdeas: ideaList.filter((idea) => idea.ownerId === userId),
    teamIdeas: ideaList.filter((idea) => idea.ownerId !== userId),
  };
}

function sortByCreatedAt(ideas: IdeaItem[]): IdeaItem[] {
  return [...ideas].sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return tb - ta;
  });
}

function getDotColor(index: number): string {
  return DOT_COLORS[index % DOT_COLORS.length];
}

function getDotStates(completed: number): boolean[] {
  return Array.from({ length: 7 }, (_, i) => i < completed);
}

describe("separateIdeas", () => {
  const ideas: IdeaItem[] = [
    { id: "a", title: "내 1", status: "draft", ownerId: "user-1", analysisData: null, createdAt: null },
    { id: "b", title: "팀 1", status: "draft", ownerId: "user-2", analysisData: null, createdAt: null },
    { id: "c", title: "내 2", status: "draft", ownerId: "user-1", analysisData: null, createdAt: null },
    { id: "d", title: "팀 2", status: "draft", ownerId: "user-3", analysisData: null, createdAt: null },
    { id: "e", title: "팀 3", status: "draft", ownerId: "user-2", analysisData: null, createdAt: null },
  ];

  it("내 아이디어만 필터링", () => {
    const { myIdeas } = separateIdeas(ideas, "user-1");
    expect(myIdeas).toHaveLength(2);
    expect(myIdeas.every((i) => i.ownerId === "user-1")).toBe(true);
  });

  it("팀 아이디어만 필터링", () => {
    const { teamIdeas } = separateIdeas(ideas, "user-1");
    expect(teamIdeas).toHaveLength(3);
  });

  it("합산 = 원본 길이", () => {
    const { myIdeas, teamIdeas } = separateIdeas(ideas, "user-1");
    expect(myIdeas.length + teamIdeas.length).toBe(ideas.length);
  });

  it("빈 배열 → 둘 다 빈 배열", () => {
    const { myIdeas, teamIdeas } = separateIdeas([], "user-1");
    expect(myIdeas).toHaveLength(0);
    expect(teamIdeas).toHaveLength(0);
  });

  it("모두 내 아이디어면 팀 빈 배열", () => {
    const mine = ideas.map((i) => ({ ...i, ownerId: "user-1" }));
    expect(separateIdeas(mine, "user-1").teamIdeas).toHaveLength(0);
  });
});

describe("sortByCreatedAt", () => {
  it("최신 아이디어가 먼저", () => {
    const ideas: IdeaItem[] = [
      { id: "a", title: "옛날", status: "draft", ownerId: "u1", analysisData: null, createdAt: "2026-01-01T00:00:00Z" },
      { id: "b", title: "최신", status: "draft", ownerId: "u1", analysisData: null, createdAt: "2026-02-15T00:00:00Z" },
      { id: "c", title: "중간", status: "draft", ownerId: "u1", analysisData: null, createdAt: "2026-01-20T00:00:00Z" },
    ];
    expect(sortByCreatedAt(ideas).map((i) => i.id)).toEqual(["b", "c", "a"]);
  });

  it("null → 맨 뒤로", () => {
    const ideas: IdeaItem[] = [
      { id: "a", title: "null", status: "draft", ownerId: "u1", analysisData: null, createdAt: null },
      { id: "b", title: "있음", status: "draft", ownerId: "u1", analysisData: null, createdAt: "2026-02-01T00:00:00Z" },
    ];
    expect(sortByCreatedAt(ideas)[0].id).toBe("b");
  });

  it("원본 불변", () => {
    const ideas: IdeaItem[] = [
      { id: "a", title: "A", status: "draft", ownerId: "u1", analysisData: null, createdAt: "2026-01-01T00:00:00Z" },
      { id: "b", title: "B", status: "draft", ownerId: "u1", analysisData: null, createdAt: "2026-02-01T00:00:00Z" },
    ];
    const original = [...ideas];
    sortByCreatedAt(ideas);
    expect(ideas).toEqual(original);
  });

  it("빈 배열 → 빈 배열", () => {
    expect(sortByCreatedAt([])).toEqual([]);
  });

  it("숫자 타임스탬프 처리", () => {
    const ideas: IdeaItem[] = [
      { id: "a", title: "A", status: "draft", ownerId: "u1", analysisData: null, createdAt: 1700000000000 },
      { id: "b", title: "B", status: "draft", ownerId: "u1", analysisData: null, createdAt: 1800000000000 },
    ];
    expect(sortByCreatedAt(ideas)[0].id).toBe("b");
  });
});

describe("getDotColor", () => {
  it("인덱스 0 → violet", () => expect(getDotColor(0)).toBe("bg-violet-500"));
  it("인덱스 7 → pink", () => expect(getDotColor(7)).toBe("bg-pink-500"));
  it("인덱스 8 → violet (순환)", () => expect(getDotColor(8)).toBe("bg-violet-500"));
  it("인덱스 15 → pink (2회 순환)", () => expect(getDotColor(15)).toBe("bg-pink-500"));
});

describe("getDotStates", () => {
  it("0 → 모두 비활성", () => {
    expect(getDotStates(0)).toEqual([false, false, false, false, false, false, false]);
  });
  it("3 → 앞 3개 활성", () => {
    expect(getDotStates(3).filter(Boolean)).toHaveLength(3);
  });
  it("7 → 모두 활성", () => {
    expect(getDotStates(7)).toEqual([true, true, true, true, true, true, true]);
  });
  it("항상 7개", () => expect(getDotStates(5)).toHaveLength(7));
  it("5 → 정확히 [T,T,T,T,T,F,F]", () => {
    expect(getDotStates(5)).toEqual([true, true, true, true, true, false, false]);
  });
});
