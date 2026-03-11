/**
 * Health Score 계산 (순수 함수)
 *
 * 4축 가중 합산: relevance(0.30) + novelty(0.20) + engagement(0.20) + conversion(0.30)
 * AI 미평가 시 부분 점수 (최대 0.50)
 *
 * @see DX-DSGN-013 §2
 */

// ============================================================================
// TYPES
// ============================================================================

export interface HealthInput {
  avgRelevance: number;
  avgNovelty: number;
  engagementRate: number;
  conversionRate30d: number;
}

export interface HealthWeights {
  relevance: number;
  novelty: number;
  engagement: number;
  conversion: number;
}

export interface ConversionRates {
  rate7d: number;
  rate30d: number;
  count7d: number;
  count30d: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

export const DEFAULT_WEIGHTS: HealthWeights = {
  relevance: 0.30,
  novelty: 0.20,
  engagement: 0.20,
  conversion: 0.30,
};

/** Health Score 계산을 시작하는 최소 아이템 수 */
export const MIN_ITEMS_FOR_HEALTH = 20;

/** REVIEW 자동 전환 임계값 */
export const REVIEW_HEALTH_THRESHOLD = 0.2;

/** 전환 0건 감지 기간 (일) */
export const ZERO_CONVERSION_DAYS = 30;

// ============================================================================
// FUNCTIONS
// ============================================================================

/**
 * 4축 Health Score 계산
 *
 * AI 미평가 시: relevance=0, novelty=0 → 나머지 2축으로만 점수 산출 (최대 0.50)
 */
export function calculateHealthScore(
  input: HealthInput,
  weights: HealthWeights = DEFAULT_WEIGHTS,
): number {
  const score =
    input.avgRelevance * weights.relevance +
    input.avgNovelty * weights.novelty +
    input.engagementRate * weights.engagement +
    input.conversionRate30d * weights.conversion;

  return Math.round(score * 1000) / 1000;
}

/**
 * Engagement Rate = (viewed + liked) / total
 *
 * dislike 패널티: dislike 비율 > 50% 일 때 초과분만큼 감점
 */
export function calculateEngagement(params: {
  totalItems: number;
  viewedCount: number;
  likeCount: number;
  dislikeCount: number;
}): number {
  if (params.totalItems === 0) return 0;

  const interacted = params.viewedCount + params.likeCount;
  let rate = Math.min(1, interacted / params.totalItems);

  const totalReactions = params.likeCount + params.dislikeCount;
  if (totalReactions > 0) {
    const dislikeRatio = params.dislikeCount / totalReactions;
    if (dislikeRatio > 0.5) {
      rate *= 1 - (dislikeRatio - 0.5);
    }
  }

  return Math.round(rate * 1000) / 1000;
}

/**
 * Composite Score = (relevance × 0.4) + (novelty × 0.3) + (quality × 0.3)
 */
export function calculateCompositeScore(params: {
  topicRelevance: number;
  novelty: number;
  quality: number;
}): number {
  const score =
    params.topicRelevance * 0.4 +
    params.novelty * 0.3 +
    params.quality * 0.3;

  return Math.round(score * 1000) / 1000;
}
