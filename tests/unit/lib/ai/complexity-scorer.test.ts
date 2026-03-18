import { describe, it, expect } from "vitest";
import {
  ComplexityScorer,
  PURPOSE_MODIFIERS,
  type ComplexityInput,
} from "~/lib/ai/complexity-scorer";

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

describe("ComplexityScorer", () => {
  const scorer = new ComplexityScorer();

  // --------------------------------------------------------------------------
  // 기본 점수 계산
  // --------------------------------------------------------------------------

  it("모든 입력이 0이면 rawScore=0, tier=frugal", () => {
    const result = scorer.score(baseInput());
    expect(result.rawScore).toBe(0);
    expect(result.adjustedScore).toBe(0);
    expect(result.tier).toBe("frugal");
  });

  it("최대 입력이면 rawScore=1 (정규화 상한)", () => {
    const result = scorer.score(
      baseInput({
        estimatedTokens: 8000,
        toolCount: 10,
        conversationDepth: 20,
      })
    );
    expect(result.rawScore).toBe(1);
    expect(result.factors.tokenFactor).toBe(1);
    expect(result.factors.toolFactor).toBe(1);
    expect(result.factors.depthFactor).toBe(1);
  });

  it("정규화 상한 초과 입력은 1로 클램프", () => {
    const result = scorer.score(
      baseInput({
        estimatedTokens: 16000, // maxTokens 8000의 2배
        toolCount: 20,
        conversationDepth: 40,
      })
    );
    expect(result.rawScore).toBe(1);
    expect(result.factors.tokenFactor).toBe(1);
    expect(result.factors.toolFactor).toBe(1);
    expect(result.factors.depthFactor).toBe(1);
  });

  // --------------------------------------------------------------------------
  // 가중치 검증
  // --------------------------------------------------------------------------

  it("토큰만 최대일 때 rawScore = 0.3 (token weight)", () => {
    const result = scorer.score(baseInput({ estimatedTokens: 8000 }));
    expect(result.rawScore).toBe(0.3);
    expect(result.factors.tokenFactor).toBe(1);
    expect(result.factors.toolFactor).toBe(0);
    expect(result.factors.depthFactor).toBe(0);
  });

  it("도구만 최대일 때 rawScore = 0.3 (tool weight)", () => {
    const result = scorer.score(baseInput({ toolCount: 10 }));
    expect(result.rawScore).toBe(0.3);
  });

  it("깊이만 최대일 때 rawScore = 0.4 (depth weight)", () => {
    const result = scorer.score(baseInput({ conversationDepth: 20 }));
    expect(result.rawScore).toBe(0.4);
  });

  // --------------------------------------------------------------------------
  // 티어 경계값
  // --------------------------------------------------------------------------

  it("adjustedScore=0.3이면 frugal (경계값)", () => {
    // rawScore=0.3, chat modifier=1.0 → adjustedScore=0.3
    const result = scorer.score(baseInput({ estimatedTokens: 8000 }));
    expect(result.adjustedScore).toBe(0.3);
    expect(result.tier).toBe("frugal");
  });

  it("adjustedScore>0.3이면 standard", () => {
    // rawScore=0.4, chat modifier=1.0 → adjustedScore=0.4
    const result = scorer.score(baseInput({ conversationDepth: 20 }));
    expect(result.adjustedScore).toBe(0.4);
    expect(result.tier).toBe("standard");
  });

  it("adjustedScore=0.7이면 standard (경계값)", () => {
    // rawScore = 0.3*(8000/8000) + 0.3*(10/10) + 0.4*(5/20)
    //          = 0.3 + 0.3 + 0.1 = 0.7, modifier=1.0 → adjustedScore=0.7
    const result = scorer.score(
      baseInput({
        estimatedTokens: 8000,
        toolCount: 10,
        conversationDepth: 5,
      })
    );
    expect(result.adjustedScore).toBe(0.7);
    expect(result.tier).toBe("standard");
  });

  it("adjustedScore>0.7이면 frontier", () => {
    const result = scorer.score(
      baseInput({
        estimatedTokens: 8000,
        toolCount: 10,
        conversationDepth: 20,
        purpose: "agent-tool", // modifier 1.2
      })
    );
    // rawScore=1.0 * 1.2 = 1.2 → clamp → 1.0
    expect(result.tier).toBe("frontier");
  });

  // --------------------------------------------------------------------------
  // purpose 보정 계수
  // --------------------------------------------------------------------------

  it("extraction purpose는 0.5 보정 → 낮은 adjustedScore", () => {
    const result = scorer.score(
      baseInput({
        estimatedTokens: 4000,
        toolCount: 5,
        conversationDepth: 10,
        purpose: "extraction",
      })
    );
    // rawScore = 0.5 * (0.3+0.3+0.4) = 0.5 → adjustedScore = 0.5 * 0.5 = 0.25
    expect(result.adjustedScore).toBe(0.25);
    expect(result.tier).toBe("frugal");
  });

  it("agent-tool purpose는 1.2 보정 → 높은 adjustedScore", () => {
    const result = scorer.score(
      baseInput({
        estimatedTokens: 4000,
        toolCount: 5,
        conversationDepth: 10,
        purpose: "agent-tool",
      })
    );
    // rawScore = 0.5 → adjustedScore = 0.5 * 1.2 = 0.6
    expect(result.adjustedScore).toBe(0.6);
    expect(result.tier).toBe("standard");
  });

  it("PURPOSE_MODIFIERS에 6개 purpose가 모두 정의됨", () => {
    const expected: string[] = [
      "extraction",
      "eval",
      "batch",
      "analysis",
      "chat",
      "agent-tool",
    ];
    expect(Object.keys(PURPOSE_MODIFIERS).sort()).toEqual(expected.sort());
  });

  // --------------------------------------------------------------------------
  // JSON 모드 보정
  // --------------------------------------------------------------------------

  it("needsJsonMode=true이면 +0.1 보정", () => {
    const without = scorer.score(baseInput({ estimatedTokens: 4000 }));
    const withJson = scorer.score(
      baseInput({ estimatedTokens: 4000, needsJsonMode: true })
    );
    expect(withJson.adjustedScore - without.adjustedScore).toBeCloseTo(0.1, 3);
  });

  it("JSON 보정 후 1.0 초과 시 클램프", () => {
    const result = scorer.score(
      baseInput({
        estimatedTokens: 8000,
        toolCount: 10,
        conversationDepth: 20,
        purpose: "agent-tool",
        needsJsonMode: true,
      })
    );
    // rawScore=1.0 * 1.2 + 0.1 = 1.3 → clamp → 1.0
    expect(result.adjustedScore).toBe(1);
    expect(result.tier).toBe("frontier");
  });

  // --------------------------------------------------------------------------
  // 소수점 정밀도
  // --------------------------------------------------------------------------

  it("결과값은 소수점 3자리로 반올림", () => {
    const result = scorer.score(
      baseInput({
        estimatedTokens: 1234,
        toolCount: 3,
        conversationDepth: 7,
      })
    );
    // 각 factor가 3자리 이하인지 확인
    const decimals = (n: number) =>
      (n.toString().split(".")[1] || "").length;
    expect(decimals(result.rawScore)).toBeLessThanOrEqual(3);
    expect(decimals(result.adjustedScore)).toBeLessThanOrEqual(3);
    expect(decimals(result.factors.tokenFactor)).toBeLessThanOrEqual(3);
  });
});
