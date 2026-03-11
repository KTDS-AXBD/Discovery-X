/**
 * Health Score 순수 함수 테스트
 *
 * 대상: app/features/radar/service/health-score.ts
 * DB 없음 — 순수 계산만 검증
 */
import { describe, it, expect } from "vitest";
import {
  calculateHealthScore,
  calculateEngagement,
  calculateCompositeScore,
  DEFAULT_WEIGHTS,
  MIN_ITEMS_FOR_HEALTH,
  REVIEW_HEALTH_THRESHOLD,
} from "~/features/radar/service/health-score";

// ============================================================================
// calculateHealthScore
// ============================================================================

describe("calculateHealthScore", () => {
  it("만점 입력 시 1.0 반환", () => {
    const score = calculateHealthScore({
      avgRelevance: 1,
      avgNovelty: 1,
      engagementRate: 1,
      conversionRate30d: 1,
    });
    expect(score).toBe(1.0);
  });

  it("모두 0이면 0 반환", () => {
    const score = calculateHealthScore({
      avgRelevance: 0,
      avgNovelty: 0,
      engagementRate: 0,
      conversionRate30d: 0,
    });
    expect(score).toBe(0);
  });

  it("AI 미평가 시 부분 점수 (최대 0.50)", () => {
    // relevance=0, novelty=0 → engagement + conversion만
    const score = calculateHealthScore({
      avgRelevance: 0,
      avgNovelty: 0,
      engagementRate: 1,
      conversionRate30d: 1,
    });
    // 0*0.3 + 0*0.2 + 1*0.2 + 1*0.3 = 0.5
    expect(score).toBe(0.5);
  });

  it("가중치 합산이 정확함", () => {
    const score = calculateHealthScore({
      avgRelevance: 0.7,
      avgNovelty: 0.5,
      engagementRate: 0.3,
      conversionRate30d: 0.2,
    });
    // 0.7*0.3 + 0.5*0.2 + 0.3*0.2 + 0.2*0.3
    // = 0.21 + 0.10 + 0.06 + 0.06 = 0.43
    expect(score).toBe(0.43);
  });

  it("커스텀 가중치 적용", () => {
    const score = calculateHealthScore(
      { avgRelevance: 1, avgNovelty: 0, engagementRate: 0, conversionRate30d: 0 },
      { relevance: 0.5, novelty: 0.2, engagement: 0.1, conversion: 0.2 },
    );
    expect(score).toBe(0.5);
  });

  it("소수점 3자리로 반올림", () => {
    const score = calculateHealthScore({
      avgRelevance: 0.333,
      avgNovelty: 0.333,
      engagementRate: 0.333,
      conversionRate30d: 0.333,
    });
    // 0.333 * (0.3+0.2+0.2+0.3) = 0.333 * 1.0 = 0.333
    expect(score).toBe(0.333);
  });

  it("REVIEW 임계값(0.2) 미만 감지", () => {
    const score = calculateHealthScore({
      avgRelevance: 0.1,
      avgNovelty: 0.1,
      engagementRate: 0.1,
      conversionRate30d: 0.1,
    });
    // 0.1 * 1.0 = 0.1
    expect(score).toBeLessThan(REVIEW_HEALTH_THRESHOLD);
  });
});

// ============================================================================
// calculateEngagement
// ============================================================================

describe("calculateEngagement", () => {
  it("아이템 0건이면 0 반환", () => {
    expect(calculateEngagement({
      totalItems: 0,
      viewedCount: 0,
      likeCount: 0,
      dislikeCount: 0,
    })).toBe(0);
  });

  it("전체 viewed이면 1.0", () => {
    expect(calculateEngagement({
      totalItems: 10,
      viewedCount: 10,
      likeCount: 0,
      dislikeCount: 0,
    })).toBe(1);
  });

  it("viewed + liked 합산", () => {
    const rate = calculateEngagement({
      totalItems: 20,
      viewedCount: 5,
      likeCount: 5,
      dislikeCount: 0,
    });
    // (5+5)/20 = 0.5
    expect(rate).toBe(0.5);
  });

  it("1.0 초과하지 않음 (캡)", () => {
    const rate = calculateEngagement({
      totalItems: 5,
      viewedCount: 10,
      likeCount: 5,
      dislikeCount: 0,
    });
    expect(rate).toBe(1);
  });

  it("dislike > 50% 패널티 적용", () => {
    const rate = calculateEngagement({
      totalItems: 10,
      viewedCount: 5,
      likeCount: 2,
      dislikeCount: 8,
    });
    // base rate = min(1, (5+2)/10) = 0.7
    // dislike ratio = 8/10 = 0.8 > 0.5
    // penalty = 1 - (0.8 - 0.5) = 0.7
    // result = 0.7 * 0.7 = 0.49
    expect(rate).toBe(0.49);
  });

  it("dislike 정확히 50%는 패널티 없음", () => {
    const rate = calculateEngagement({
      totalItems: 10,
      viewedCount: 5,
      likeCount: 3,
      dislikeCount: 3,
    });
    // (5+3)/10 = 0.8, dislike ratio = 0.5 → 패널티 없음
    expect(rate).toBe(0.8);
  });

  it("like만 있고 dislike 없으면 패널티 없음", () => {
    const rate = calculateEngagement({
      totalItems: 10,
      viewedCount: 3,
      likeCount: 7,
      dislikeCount: 0,
    });
    // (3+7)/10 = 1.0
    expect(rate).toBe(1);
  });

  it("dislike만 있으면 (100% dislike) 최대 패널티", () => {
    const rate = calculateEngagement({
      totalItems: 10,
      viewedCount: 5,
      likeCount: 0,
      dislikeCount: 5,
    });
    // base = 5/10 = 0.5
    // dislike ratio = 5/5 = 1.0
    // penalty = 1 - (1.0 - 0.5) = 0.5
    // result = 0.5 * 0.5 = 0.25
    expect(rate).toBe(0.25);
  });
});

// ============================================================================
// calculateCompositeScore
// ============================================================================

describe("calculateCompositeScore", () => {
  it("만점 시 1.0", () => {
    expect(calculateCompositeScore({
      topicRelevance: 1,
      novelty: 1,
      quality: 1,
    })).toBe(1);
  });

  it("모두 0이면 0", () => {
    expect(calculateCompositeScore({
      topicRelevance: 0,
      novelty: 0,
      quality: 0,
    })).toBe(0);
  });

  it("가중치 (0.4, 0.3, 0.3) 적용", () => {
    const score = calculateCompositeScore({
      topicRelevance: 0.8,
      novelty: 0.6,
      quality: 0.4,
    });
    // 0.8*0.4 + 0.6*0.3 + 0.4*0.3 = 0.32 + 0.18 + 0.12 = 0.62
    expect(score).toBe(0.62);
  });

  it("소수점 3자리 반올림", () => {
    const score = calculateCompositeScore({
      topicRelevance: 0.333,
      novelty: 0.333,
      quality: 0.333,
    });
    // 0.333 * (0.4+0.3+0.3) = 0.333
    expect(score).toBe(0.333);
  });
});

// ============================================================================
// Constants
// ============================================================================

describe("Health Score 상수", () => {
  it("MIN_ITEMS_FOR_HEALTH = 20", () => {
    expect(MIN_ITEMS_FOR_HEALTH).toBe(20);
  });

  it("REVIEW_HEALTH_THRESHOLD = 0.2", () => {
    expect(REVIEW_HEALTH_THRESHOLD).toBe(0.2);
  });

  it("DEFAULT_WEIGHTS 합산 = 1.0", () => {
    const sum = DEFAULT_WEIGHTS.relevance + DEFAULT_WEIGHTS.novelty +
      DEFAULT_WEIGHTS.engagement + DEFAULT_WEIGHTS.conversion;
    expect(sum).toBe(1.0);
  });
});
