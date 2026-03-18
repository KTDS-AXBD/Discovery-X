/**
 * ComplexityScorer — 요청 복잡도 점수 산출 (0~1).
 * 순수 함수 — DB 의존 없음, 테스트 용이.
 *
 * 가중치: tokenFactor 0.30 + toolFactor 0.30 + depthFactor 0.40
 * 보정: purpose별 계수 (extraction×0.5, eval×0.6 등)
 */

import type { Purpose } from "~/features/cost/constants/purpose";

// ============================================================================
// TYPES
// ============================================================================

export type Tier = "frugal" | "standard" | "frontier";

export interface ComplexityInput {
  estimatedTokens: number;
  toolCount: number;
  conversationDepth: number;
  purpose: Purpose;
  needsJsonMode?: boolean;
}

export interface ComplexityResult {
  rawScore: number;
  adjustedScore: number;
  tier: Tier;
  factors: {
    tokenFactor: number;
    toolFactor: number;
    depthFactor: number;
  };
}

// ============================================================================
// CONSTANTS
// ============================================================================

const WEIGHTS = {
  token: 0.30,
  tool: 0.30,
  depth: 0.40,
} as const;

const NORMALIZATION = {
  maxTokens: 8000,
  maxTools: 10,
  maxDepth: 20,
} as const;

/** purpose별 복잡도 보정 계수 */
export const PURPOSE_MODIFIERS: Record<Purpose, number> = {
  extraction: 0.5,
  eval: 0.6,
  batch: 0.7,
  analysis: 1.0,
  chat: 1.0,
  "agent-tool": 1.2,
};

const TIER_THRESHOLDS = {
  frugalMax: 0.3,
  standardMax: 0.7,
} as const;

// ============================================================================
// COMPLEXITY SCORER
// ============================================================================

export class ComplexityScorer {
  /**
   * 요청 메타데이터 → 복잡도 점수 + 티어 결정.
   *
   * 1. 3가지 팩터 정규화 (0~1)
   * 2. 가중 합산 → rawScore
   * 3. purpose별 보정 + JSON 모드 보정 → adjustedScore
   * 4. adjustedScore → 3티어 분류
   */
  score(input: ComplexityInput): ComplexityResult {
    const tokenFactor = clamp01(input.estimatedTokens / NORMALIZATION.maxTokens);
    const toolFactor = clamp01(input.toolCount / NORMALIZATION.maxTools);
    const depthFactor = clamp01(input.conversationDepth / NORMALIZATION.maxDepth);

    const rawScore =
      WEIGHTS.token * tokenFactor +
      WEIGHTS.tool * toolFactor +
      WEIGHTS.depth * depthFactor;

    let adjustedScore = rawScore * (PURPOSE_MODIFIERS[input.purpose] ?? 1.0);

    if (input.needsJsonMode) {
      adjustedScore += 0.1;
    }

    adjustedScore = clamp01(adjustedScore);

    const tier = scoreToTier(adjustedScore);

    return {
      rawScore: round3(rawScore),
      adjustedScore: round3(adjustedScore),
      tier,
      factors: {
        tokenFactor: round3(tokenFactor),
        toolFactor: round3(toolFactor),
        depthFactor: round3(depthFactor),
      },
    };
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function scoreToTier(score: number): Tier {
  if (score <= TIER_THRESHOLDS.frugalMax) return "frugal";
  if (score <= TIER_THRESHOLDS.standardMax) return "standard";
  return "frontier";
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
