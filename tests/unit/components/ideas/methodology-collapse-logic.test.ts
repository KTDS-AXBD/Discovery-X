import { describe, it, expect } from "vitest";

/**
 * 방법론 접기/펼치기 로직 테스트
 * — Set 기반 expandedKeys 토글 로직 검증
 */

// MethodologyCards 컴포넌트의 toggleExpanded 로직 (순수 함수로 추출)
function toggleExpanded(prev: Set<string>, key: string): Set<string> {
  const next = new Set(prev);
  if (next.has(key)) {
    next.delete(key);
  } else {
    next.add(key);
  }
  return next;
}

// 카드 클릭 시 동작 결정 로직
function determineCardAction(
  key: string,
  hasData: boolean,
  isStale: boolean,
  isLoading: boolean,
): "toggle" | "start_analysis" | "none" {
  if (hasData || isStale) return "toggle";
  if (!isLoading) return "start_analysis";
  return "none";
}

describe("방법론 접기/펼치기 로직", () => {
  describe("toggleExpanded", () => {
    it("빈 Set에서 키를 추가한다", () => {
      const result = toggleExpanded(new Set(), "market_research");
      expect(result.has("market_research")).toBe(true);
      expect(result.size).toBe(1);
    });

    it("이미 있는 키를 제거한다", () => {
      const result = toggleExpanded(new Set(["market_research"]), "market_research");
      expect(result.has("market_research")).toBe(false);
      expect(result.size).toBe(0);
    });

    it("여러 키를 동시에 확장할 수 있다", () => {
      let keys = new Set<string>();
      keys = toggleExpanded(keys, "market_research");
      keys = toggleExpanded(keys, "customer_research");
      keys = toggleExpanded(keys, "feasibility");
      expect(keys.size).toBe(3);
      expect(keys.has("market_research")).toBe(true);
      expect(keys.has("customer_research")).toBe(true);
      expect(keys.has("feasibility")).toBe(true);
    });

    it("하나만 접어도 나머지는 유지된다", () => {
      let keys = new Set(["market_research", "customer_research", "feasibility"]);
      keys = toggleExpanded(keys, "customer_research");
      expect(keys.size).toBe(2);
      expect(keys.has("market_research")).toBe(true);
      expect(keys.has("customer_research")).toBe(false);
      expect(keys.has("feasibility")).toBe(true);
    });

    it("원본 Set을 변경하지 않는다 (불변성)", () => {
      const original = new Set(["market_research"]);
      const result = toggleExpanded(original, "market_research");
      expect(original.has("market_research")).toBe(true);
      expect(result.has("market_research")).toBe(false);
    });

    it("같은 키를 두 번 토글하면 원래 상태로 돌아온다", () => {
      let keys = new Set<string>();
      keys = toggleExpanded(keys, "regulation");
      expect(keys.has("regulation")).toBe(true);
      keys = toggleExpanded(keys, "regulation");
      expect(keys.has("regulation")).toBe(false);
    });
  });

  describe("determineCardAction", () => {
    it("데이터가 있는 카드 클릭 → toggle", () => {
      expect(determineCardAction("key", true, false, false)).toBe("toggle");
    });

    it("stale 카드 클릭 → toggle (내용 보여주고 재분석 유도)", () => {
      expect(determineCardAction("key", true, true, false)).toBe("toggle");
    });

    it("데이터 없고 로딩 아닌 카드 → start_analysis", () => {
      expect(determineCardAction("key", false, false, false)).toBe("start_analysis");
    });

    it("로딩 중인 카드 → none (중복 실행 방지)", () => {
      expect(determineCardAction("key", false, false, true)).toBe("none");
    });

    it("stale이지만 데이터 없음 → start_analysis", () => {
      expect(determineCardAction("key", false, true, false)).toBe("toggle");
    });
  });
});
