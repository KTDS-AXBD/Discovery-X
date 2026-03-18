/**
 * TierRouter — 3티어 복잡도 기반 라우팅.
 *
 * Frugal (≤0.3) / Standard (≤0.7) / Frontier (>0.7)
 *
 * 독립 모듈 — PolicyRouter/FallbackManager를 감싸지 않음.
 * 리더가 executor-stream 통합 시 TierRouter.route() → PolicyRouter.route(tierFilter)로 연결.
 *
 * 에스컬레이션: 연속 2실패 → 상위 티어
 * 다운그레이드: 연속 5성공 → 하위 티어
 * Jaccard 유사도: 태스크 유형 간 tier override 상속
 */

import type { Purpose } from "~/features/cost/constants/purpose";
import {
  ComplexityScorer,
  type ComplexityInput,
  type ComplexityResult,
  type Tier,
} from "./complexity-scorer";

// ============================================================================
// TYPES
// ============================================================================

export interface TierRoutingResult {
  complexity: ComplexityResult;
  effectiveTier: Tier;
  escalatedFrom?: Tier;
}

export interface EscalationEvent {
  fromTier: Tier;
  toTier: Tier;
  reason: string;
  timestamp: number;
}

/** 태스크 유형 시그니처 (Jaccard 비교 단위) */
interface TaskTypeSignature {
  purpose: Purpose;
  toolCountCenter: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const ESCALATION_THRESHOLD = 2;
const DOWNGRADE_THRESHOLD = 5;
const JACCARD_SIMILARITY_MIN = 0.5;
const TOOL_RANGE_HALF = 2; // toolCount ± 2

const TIER_ESCALATION_MAP: Record<Tier, Tier | null> = {
  frugal: "standard",
  standard: "frontier",
  frontier: null,
};

const TIER_DOWNGRADE_MAP: Record<Tier, Tier | null> = {
  frugal: null,
  standard: "frugal",
  frontier: "standard",
};

// ============================================================================
// TIER ROUTER
// ============================================================================

export class TierRouter {
  private scorer = new ComplexityScorer();

  /** 연속 실패 카운트 — key: stateKey */
  private failureStreaks = new Map<string, number>();
  /** 연속 성공 카운트 — key: stateKey */
  private successStreaks = new Map<string, number>();
  /** 학습된 tier override — key: stateKey → overridden tier */
  private tierOverrides = new Map<string, Tier>();
  /** 에스컬레이션 이력 (디버깅/로깅용) */
  private escalationHistory: EscalationEvent[] = [];

  /**
   * 요청 복잡도 산출 → 티어 결정.
   *
   * 1. ComplexityScorer로 rawScore/adjustedScore 계산
   * 2. Jaccard 유사도 기반 tier override 확인
   * 3. 에스컬레이션 override 확인
   * 4. effectiveTier 반환
   */
  route(input: ComplexityInput): TierRoutingResult {
    const complexity = this.scorer.score(input);
    let effectiveTier = complexity.tier;
    let escalatedFrom: Tier | undefined;

    // 학습된 override 확인 (Jaccard 유사도 기반)
    const override = this.findOverride(input.purpose, input.toolCount);
    if (override) {
      escalatedFrom = effectiveTier;
      effectiveTier = override;
    }

    return { complexity, effectiveTier, escalatedFrom };
  }

  /**
   * 성공 기록 → 연속 5성공 시 하위 티어로 다운그레이드.
   * 실패 카운터 리셋.
   */
  recordSuccess(purpose: Purpose, toolCount: number, tier: Tier): void {
    const key = makeStateKey(purpose, toolCount);
    this.failureStreaks.set(key, 0);

    const streak = (this.successStreaks.get(key) ?? 0) + 1;
    this.successStreaks.set(key, streak);

    if (streak >= DOWNGRADE_THRESHOLD) {
      const lower = TIER_DOWNGRADE_MAP[tier];
      if (lower) {
        this.tierOverrides.set(key, lower);
        // 유사 태스크 유형에도 상속
        this.propagateOverride(purpose, toolCount, lower);
      }
      this.successStreaks.set(key, 0);
    }
  }

  /**
   * 실패 기록 → 연속 2실패 시 상위 티어로 에스컬레이션.
   * 성공 카운터 리셋.
   *
   * @returns 에스컬레이션된 티어 (null이면 에스컬레이션 없음)
   */
  recordFailure(
    purpose: Purpose,
    toolCount: number,
    tier: Tier,
    reason?: string
  ): Tier | null {
    const key = makeStateKey(purpose, toolCount);
    this.successStreaks.set(key, 0);

    const streak = (this.failureStreaks.get(key) ?? 0) + 1;
    this.failureStreaks.set(key, streak);

    if (streak >= ESCALATION_THRESHOLD) {
      const upper = TIER_ESCALATION_MAP[tier];
      if (upper) {
        this.tierOverrides.set(key, upper);
        this.escalationHistory.push({
          fromTier: tier,
          toTier: upper,
          reason: reason ?? `${streak} consecutive failures`,
          timestamp: Date.now(),
        });
        // 유사 태스크 유형에도 상속
        this.propagateOverride(purpose, toolCount, upper);
        this.failureStreaks.set(key, 0);
        return upper;
      }
    }

    return null;
  }

  /** 에스컬레이션 이력 조회 */
  getEscalationHistory(): readonly EscalationEvent[] {
    return this.escalationHistory;
  }

  /** 특정 태스크 유형의 현재 override 조회 */
  getOverride(purpose: Purpose, toolCount: number): Tier | null {
    return this.findOverride(purpose, toolCount);
  }

  /**
   * 에스컬레이션 임박 판단 — 다음 recordFailure() 호출 시 에스컬레이션 발생 여부.
   * 상태를 변경하지 않는 읽기 전용 검사.
   */
  shouldEscalate(
    purpose: Purpose,
    toolCount: number,
    currentTier: Tier
  ): boolean {
    const key = makeStateKey(purpose, toolCount);
    const streak = this.failureStreaks.get(key) ?? 0;
    return (
      streak >= ESCALATION_THRESHOLD - 1 &&
      TIER_ESCALATION_MAP[currentTier] !== null
    );
  }

  /** 모든 상태 초기화 */
  reset(): void {
    this.failureStreaks.clear();
    this.successStreaks.clear();
    this.tierOverrides.clear();
    this.escalationHistory = [];
  }

  // ==========================================================================
  // JACCARD SIMILARITY — 태스크 유형 상속
  // ==========================================================================

  /**
   * 기존 override 중 Jaccard 유사도 기반으로 매칭되는 tier 찾기.
   *
   * 1. 동일 purpose의 override만 대상
   * 2. toolCount 범위(±2) 간 Jaccard 유사도 계산
   * 3. 최고 유사도가 JACCARD_SIMILARITY_MIN 이상이면 해당 tier 반환
   */
  private findOverride(purpose: Purpose, toolCount: number): Tier | null {
    // 정확한 키 매치 우선
    const exactKey = makeStateKey(purpose, toolCount);
    const exact = this.tierOverrides.get(exactKey);
    if (exact) return exact;

    // Jaccard 유사도 기반 매칭
    let bestTier: Tier | null = null;
    let bestSimilarity = 0;

    for (const [key, tier] of this.tierOverrides) {
      const parsed = parseStateKey(key);
      if (!parsed || parsed.purpose !== purpose) continue;

      const similarity = jaccardSimilarity(toolCount, parsed.toolCount);
      if (similarity > bestSimilarity && similarity >= JACCARD_SIMILARITY_MIN) {
        bestSimilarity = similarity;
        bestTier = tier;
      }
    }

    return bestTier;
  }

  /**
   * 기존에 등록된 유사 태스크 유형에 override를 전파.
   * 새 override가 설정될 때, 동일 purpose + 높은 Jaccard 유사도를 가진
   * 아직 override가 없는 키에도 동일 tier를 설정.
   */
  private propagateOverride(
    purpose: Purpose,
    toolCount: number,
    tier: Tier
  ): void {
    // 현재 활성 키 중 유사한 것 탐색
    const allKeys = new Set([
      ...this.failureStreaks.keys(),
      ...this.successStreaks.keys(),
    ]);

    for (const key of allKeys) {
      if (this.tierOverrides.has(key)) continue; // 이미 override 있음

      const parsed = parseStateKey(key);
      if (!parsed || parsed.purpose !== purpose) continue;

      const similarity = jaccardSimilarity(toolCount, parsed.toolCount);
      if (similarity >= JACCARD_SIMILARITY_MIN) {
        this.tierOverrides.set(key, tier);
      }
    }
  }
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * 태스크 유형 상태 키 생성.
 * 형식: "{purpose}:{toolCount}"
 */
function makeStateKey(purpose: Purpose, toolCount: number): string {
  return `${purpose}:${toolCount}`;
}

/** 상태 키 파싱 → { purpose, toolCount } */
function parseStateKey(
  key: string
): { purpose: Purpose; toolCount: number } | null {
  const idx = key.lastIndexOf(":");
  if (idx < 0) return null;
  const purpose = key.slice(0, idx) as Purpose;
  const toolCount = parseInt(key.slice(idx + 1), 10);
  if (isNaN(toolCount)) return null;
  return { purpose, toolCount };
}

/**
 * Jaccard 유사도 — toolCount 범위(±2) 간 겹침 비율.
 *
 * 범위 A: [a - HALF, a + HALF]
 * 범위 B: [b - HALF, b + HALF]
 * Jaccard = |A ∩ B| / |A ∪ B|
 *
 * 정수 범위이므로 원소 수 기반 계산:
 *   size = 2 * HALF + 1 (각 범위의 정수 개수)
 *   overlap = max(0, min(a+HALF, b+HALF) - max(a-HALF, b-HALF) + 1)
 *   union = 2 * size - overlap
 */
function jaccardSimilarity(a: number, b: number): number {
  const aMin = Math.max(0, a - TOOL_RANGE_HALF);
  const aMax = a + TOOL_RANGE_HALF;
  const bMin = Math.max(0, b - TOOL_RANGE_HALF);
  const bMax = b + TOOL_RANGE_HALF;

  const overlapStart = Math.max(aMin, bMin);
  const overlapEnd = Math.min(aMax, bMax);
  const overlap = Math.max(0, overlapEnd - overlapStart + 1);

  const sizeA = aMax - aMin + 1;
  const sizeB = bMax - bMin + 1;
  const union = sizeA + sizeB - overlap;

  if (union === 0) return 0;
  return overlap / union;
}
