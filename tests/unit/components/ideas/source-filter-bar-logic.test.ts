import { describe, it, expect } from "vitest";
import { type SourceTypeFilter, SOURCE_TYPE_LABELS } from "~/lib/utils/source-type";

/**
 * SourceFilterBar 내부 순수 로직 검증
 *
 * 컴포넌트의 필터 키 목록, isEmpty 판별, 레이블 매핑 등을 검증한다.
 *
 * 참조: app/components/ideas/SourceFilterBar.tsx
 */

const FILTER_KEYS: SourceTypeFilter[] = ["all", "web", "youtube", "text", "pdf"];

// SourceFilterBar.tsx:21 isEmpty 로직 재현
function isEmpty(key: SourceTypeFilter, count: number): boolean {
  return key !== "all" && count === 0;
}

// SourceFilterBar.tsx:18-43 버튼 상태 결정 로직 재현
function getButtonState(
  key: SourceTypeFilter,
  activeValue: SourceTypeFilter,
  counts: Partial<Record<SourceTypeFilter, number>>
): { isActive: boolean; isDisabled: boolean; label: string; count: number } {
  const count = counts[key] ?? 0;
  const isActive = activeValue === key;
  const isDisabled = isEmpty(key, count);
  return {
    isActive,
    isDisabled,
    label: SOURCE_TYPE_LABELS[key],
    count,
  };
}

describe("FILTER_KEYS", () => {
  it("5개 필터 키 정의 (all, web, youtube, text, pdf)", () => {
    expect(FILTER_KEYS).toEqual(["all", "web", "youtube", "text", "pdf"]);
  });

  it("모든 키에 SOURCE_TYPE_LABELS 매핑 존재", () => {
    for (const key of FILTER_KEYS) {
      expect(SOURCE_TYPE_LABELS[key]).toBeDefined();
    }
  });
});

describe("isEmpty", () => {
  it("all 키는 항상 false (count=0이어도)", () => {
    expect(isEmpty("all", 0)).toBe(false);
  });

  it("all 키 + count > 0 → false", () => {
    expect(isEmpty("all", 5)).toBe(false);
  });

  it("web + count=0 → true (비활성화)", () => {
    expect(isEmpty("web", 0)).toBe(true);
  });

  it("web + count > 0 → false (활성화)", () => {
    expect(isEmpty("web", 3)).toBe(false);
  });

  it("youtube + count=0 → true", () => {
    expect(isEmpty("youtube", 0)).toBe(true);
  });

  it("text + count=0 → true", () => {
    expect(isEmpty("text", 0)).toBe(true);
  });

  it("pdf + count=0 → true", () => {
    expect(isEmpty("pdf", 0)).toBe(true);
  });
});

describe("getButtonState", () => {
  const fullCounts: Partial<Record<SourceTypeFilter, number>> = {
    all: 10,
    web: 5,
    youtube: 3,
    text: 1,
    pdf: 1,
  };

  it("활성 필터의 isActive=true", () => {
    const state = getButtonState("web", "web", fullCounts);
    expect(state.isActive).toBe(true);
    expect(state.isDisabled).toBe(false);
    expect(state.count).toBe(5);
  });

  it("비활성 필터의 isActive=false", () => {
    const state = getButtonState("youtube", "web", fullCounts);
    expect(state.isActive).toBe(false);
  });

  it("count=0인 필터는 disabled", () => {
    const sparseCount: Partial<Record<SourceTypeFilter, number>> = {
      all: 3,
      web: 3,
    };
    const state = getButtonState("youtube", "all", sparseCount);
    expect(state.isDisabled).toBe(true);
    expect(state.count).toBe(0);
  });

  it("counts에 키가 없으면 0으로 처리", () => {
    const state = getButtonState("pdf", "all", { all: 5 });
    expect(state.count).toBe(0);
    expect(state.isDisabled).toBe(true);
  });

  it("all 필터는 count=0이어도 disabled 아님", () => {
    const state = getButtonState("all", "all", { all: 0 });
    expect(state.isDisabled).toBe(false);
    expect(state.isActive).toBe(true);
  });

  it("레이블이 올바르게 매핑됨", () => {
    for (const key of FILTER_KEYS) {
      const state = getButtonState(key, "all", fullCounts);
      expect(state.label).toBe(SOURCE_TYPE_LABELS[key]);
    }
  });
});
