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
