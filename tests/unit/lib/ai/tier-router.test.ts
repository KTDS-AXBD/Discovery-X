import { describe, it, expect, beforeEach } from "vitest";
import { TierRouter } from "~/lib/ai/tier-router";
import type { ComplexityInput } from "~/lib/ai/complexity-scorer";

// ============================================================================
// HELPERS
// ============================================================================

function baseInput(overrides: Partial<ComplexityInput> = {}): ComplexityInput {
  return {
    estimatedTokens: 0,
    toolCount: 0,
    conversationDepth: 0,
    purpose: "chat",
    ...overrides,
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe("TierRouter", () => {
  let router: TierRouter;

  beforeEach(() => {
    router = new TierRouter();
  });

  // --------------------------------------------------------------------------
  // 기본 점수 → 티어 매핑
  // --------------------------------------------------------------------------

  it("낮은 복잡도 → frugal 티어", () => {
    const result = router.route(
      baseInput({ estimatedTokens: 100, toolCount: 0, conversationDepth: 1 })
    );
    expect(result.effectiveTier).toBe("frugal");
    expect(result.complexity.tier).toBe("frugal");
    expect(result.escalatedFrom).toBeUndefined();
  });

  it("중간 복잡도 → standard 티어", () => {
    const result = router.route(
      baseInput({
        estimatedTokens: 4000,
        toolCount: 5,
        conversationDepth: 10,
      })
    );
    // rawScore=0.5, chat modifier=1.0 → adjustedScore=0.5 → standard
    expect(result.effectiveTier).toBe("standard");
  });

  it("높은 복잡도 → frontier 티어", () => {
    const result = router.route(
      baseInput({
        estimatedTokens: 8000,
        toolCount: 10,
        conversationDepth: 20,
      })
    );
    expect(result.effectiveTier).toBe("frontier");
  });

  it("ComplexityResult factors가 반환에 포함됨", () => {
    const result = router.route(
      baseInput({ estimatedTokens: 4000, toolCount: 5, conversationDepth: 10 })
    );
    expect(result.complexity.factors).toBeDefined();
    expect(result.complexity.factors.tokenFactor).toBe(0.5);
    expect(result.complexity.factors.toolFactor).toBe(0.5);
    expect(result.complexity.factors.depthFactor).toBe(0.5);
  });

  // --------------------------------------------------------------------------
  // 에스컬레이션 (연속 2실패)
  // --------------------------------------------------------------------------

  it("연속 1실패는 에스컬레이션 없음", () => {
    const escalated = router.recordFailure("chat", 3, "frugal");
    expect(escalated).toBeNull();
  });

  it("연속 2실패 → 상위 티어로 에스컬레이션", () => {
    router.recordFailure("chat", 3, "frugal");
    const escalated = router.recordFailure("chat", 3, "frugal");
    expect(escalated).toBe("standard");
  });

  it("standard에서 연속 2실패 → frontier 에스컬레이션", () => {
    router.recordFailure("chat", 3, "standard");
    const escalated = router.recordFailure("chat", 3, "standard");
    expect(escalated).toBe("frontier");
  });

  it("frontier에서 연속 2실패 → null (상위 티어 없음)", () => {
    router.recordFailure("chat", 3, "frontier");
    const escalated = router.recordFailure("chat", 3, "frontier");
    expect(escalated).toBeNull();
  });

  it("에스컬레이션 후 override가 route()에 반영됨", () => {
    router.recordFailure("chat", 3, "frugal");
    router.recordFailure("chat", 3, "frugal"); // → standard override

    const result = router.route(
      baseInput({ estimatedTokens: 0, toolCount: 3, conversationDepth: 0 })
    );
    // 원래 frugal이지만 override로 standard
    expect(result.effectiveTier).toBe("standard");
    expect(result.escalatedFrom).toBe("frugal");
  });

  it("에스컬레이션 이력이 기록됨", () => {
    router.recordFailure("chat", 3, "frugal");
    router.recordFailure("chat", 3, "frugal");

    const history = router.getEscalationHistory();
    expect(history).toHaveLength(1);
    expect(history[0].fromTier).toBe("frugal");
    expect(history[0].toTier).toBe("standard");
  });

  // --------------------------------------------------------------------------
  // 다운그레이드 (연속 5성공)
  // --------------------------------------------------------------------------

  it("연속 4성공은 다운그레이드 없음", () => {
    for (let i = 0; i < 4; i++) {
      router.recordSuccess("chat", 3, "standard");
    }
    const override = router.getOverride("chat", 3);
    expect(override).toBeNull();
  });

  it("연속 5성공 → 하위 티어로 다운그레이드", () => {
    for (let i = 0; i < 5; i++) {
      router.recordSuccess("chat", 3, "standard");
    }
    const override = router.getOverride("chat", 3);
    expect(override).toBe("frugal");
  });

  it("frugal에서 연속 5성공 → 다운그레이드 없음 (최하위)", () => {
    for (let i = 0; i < 5; i++) {
      router.recordSuccess("chat", 3, "frugal");
    }
    const override = router.getOverride("chat", 3);
    expect(override).toBeNull();
  });

  // --------------------------------------------------------------------------
  // 성공/실패 카운터 리셋
  // --------------------------------------------------------------------------

  it("성공 후 실패하면 성공 streak 리셋", () => {
    router.recordSuccess("chat", 3, "standard");
    router.recordSuccess("chat", 3, "standard");
    router.recordSuccess("chat", 3, "standard");
    router.recordFailure("chat", 3, "standard"); // 성공 streak 리셋
    router.recordSuccess("chat", 3, "standard");
    router.recordSuccess("chat", 3, "standard");

    // 총 성공 5번이지만 중간에 리셋 → 다운그레이드 없음
    const override = router.getOverride("chat", 3);
    expect(override).toBeNull();
  });

  it("실패 후 성공하면 실패 streak 리셋", () => {
    router.recordFailure("chat", 3, "frugal");
    router.recordSuccess("chat", 3, "frugal"); // 실패 streak 리셋
    router.recordFailure("chat", 3, "frugal");

    // 총 실패 2번이지만 중간에 리셋 → 에스컬레이션 없음
    const override = router.getOverride("chat", 3);
    expect(override).toBeNull();
  });

  // --------------------------------------------------------------------------
  // Jaccard 유사도 기반 전파
  // --------------------------------------------------------------------------

  it("toolCount ±2 범위 내 유사 태스크에 override 전파", () => {
    // toolCount=3에서 에스컬레이션 → toolCount=4(같은 purpose)에도 전파
    // 전파 대상이 되려면 먼저 failureStreaks/successStreaks에 키가 있어야 함
    router.recordSuccess("chat", 4, "frugal"); // 키 등록용

    router.recordFailure("chat", 3, "frugal");
    router.recordFailure("chat", 3, "frugal"); // → standard override + 전파

    const override = router.getOverride("chat", 4);
    expect(override).toBe("standard"); // Jaccard 유사도로 전파됨
  });

  it("toolCount 차이가 크면 override 미전파", () => {
    router.recordSuccess("chat", 10, "frugal"); // 키 등록용

    router.recordFailure("chat", 3, "frugal");
    router.recordFailure("chat", 3, "frugal"); // → standard override

    const override = router.getOverride("chat", 10);
    expect(override).toBeNull(); // toolCount 차이 7 → Jaccard < 0.5
  });

  it("다른 purpose에는 override 미전파", () => {
    router.recordSuccess("analysis", 3, "frugal"); // 키 등록용

    router.recordFailure("chat", 3, "frugal");
    router.recordFailure("chat", 3, "frugal"); // → standard override

    const override = router.getOverride("analysis", 3);
    expect(override).toBeNull();
  });

  // --------------------------------------------------------------------------
  // 2단계 연속 에스컬레이션
  // --------------------------------------------------------------------------

  it("frugal→standard→frontier 2단계 연속 에스컬레이션", () => {
    // frugal 2실패 → standard 에스컬레이션
    router.recordFailure("chat", 3, "frugal");
    const first = router.recordFailure("chat", 3, "frugal");
    expect(first).toBe("standard");

    // standard 2실패 → frontier 에스컬레이션
    router.recordFailure("chat", 3, "standard");
    const second = router.recordFailure("chat", 3, "standard");
    expect(second).toBe("frontier");

    // route()에서 frontier override 확인
    const result = router.route(
      baseInput({ estimatedTokens: 0, toolCount: 3, conversationDepth: 0 })
    );
    expect(result.effectiveTier).toBe("frontier");
  });

  it("에스컬레이션 이력이 2건 기록됨 (2단계)", () => {
    router.recordFailure("chat", 3, "frugal");
    router.recordFailure("chat", 3, "frugal");
    router.recordFailure("chat", 3, "standard");
    router.recordFailure("chat", 3, "standard");

    const history = router.getEscalationHistory();
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({ fromTier: "frugal", toTier: "standard" });
    expect(history[1]).toMatchObject({
      fromTier: "standard",
      toTier: "frontier",
    });
  });

  // --------------------------------------------------------------------------
  // shouldEscalate
  // --------------------------------------------------------------------------

  it("shouldEscalate() — 실패 없으면 false", () => {
    expect(router.shouldEscalate("chat", 3, "frugal")).toBe(false);
  });

  it("shouldEscalate() — 1실패 후 다음 실패 시 에스컬레이션 예측", () => {
    router.recordFailure("chat", 3, "frugal"); // streak=1
    expect(router.shouldEscalate("chat", 3, "frugal")).toBe(true);
  });

  it("shouldEscalate() — frontier에서는 항상 false", () => {
    router.recordFailure("chat", 3, "frontier"); // streak=1
    expect(router.shouldEscalate("chat", 3, "frontier")).toBe(false);
  });

  // --------------------------------------------------------------------------
  // frontier 다운그레이드
  // --------------------------------------------------------------------------

  it("frontier 연속 5성공 → standard 다운그레이드", () => {
    for (let i = 0; i < 5; i++) {
      router.recordSuccess("chat", 3, "frontier");
    }
    const override = router.getOverride("chat", 3);
    expect(override).toBe("standard");
  });

  it("다운그레이드 후 route()에서 하위 티어 반영", () => {
    // frontier에서 5성공 → standard 다운그레이드
    for (let i = 0; i < 5; i++) {
      router.recordSuccess("analysis", 5, "frontier");
    }

    // 원래 frontier인 입력(adjustedScore=0.85)이 override로 standard 반환
    const result = router.route(
      baseInput({
        estimatedTokens: 8000,
        toolCount: 5,
        conversationDepth: 20,
        purpose: "analysis",
      })
    );
    expect(result.effectiveTier).toBe("standard");
    expect(result.escalatedFrom).toBe("frontier");
  });

  // --------------------------------------------------------------------------
  // reset
  // --------------------------------------------------------------------------

  it("reset()으로 모든 상태 초기화", () => {
    router.recordFailure("chat", 3, "frugal");
    router.recordFailure("chat", 3, "frugal"); // override 생성

    router.reset();

    expect(router.getOverride("chat", 3)).toBeNull();
    expect(router.getEscalationHistory()).toHaveLength(0);
  });
});
