/**
 * Source Lifecycle 전환 규칙 단위 테스트
 *
 * 대상: app/features/radar/constants/source-lifecycle.ts
 * 커버: SOURCE_ALLOWED_TRANSITIONS, validateSourceTransition, FAILED→ACTIVE [R2]
 */
import { describe, it, expect } from "vitest";
import {
  SOURCE_ALLOWED_TRANSITIONS,
  validateSourceTransition,
  COLLECTIBLE_STATUSES,
  ATTENTION_STATUSES,
  TERMINAL_SOURCE_STATUSES,
  REVIEW_THRESHOLDS,
} from "~/features/radar/constants/source-lifecycle";

// ============================================================================
// SOURCE_ALLOWED_TRANSITIONS
// ============================================================================

describe("SOURCE_ALLOWED_TRANSITIONS", () => {
  it("ACTIVE: PAUSED, REVIEW, FAILED로 전환 가능", () => {
    expect(SOURCE_ALLOWED_TRANSITIONS.ACTIVE).toContain("PAUSED");
    expect(SOURCE_ALLOWED_TRANSITIONS.ACTIVE).toContain("REVIEW");
    expect(SOURCE_ALLOWED_TRANSITIONS.ACTIVE).toContain("FAILED");
  });

  it("ACTIVE: ARCHIVED로 직접 전환 불가", () => {
    expect(SOURCE_ALLOWED_TRANSITIONS.ACTIVE).not.toContain("ARCHIVED");
  });

  it("PAUSED: ACTIVE로만 전환 가능", () => {
    expect(SOURCE_ALLOWED_TRANSITIONS.PAUSED).toEqual(["ACTIVE"]);
  });

  it("REVIEW: ACTIVE, ARCHIVED로 전환 가능", () => {
    expect(SOURCE_ALLOWED_TRANSITIONS.REVIEW).toContain("ACTIVE");
    expect(SOURCE_ALLOWED_TRANSITIONS.REVIEW).toContain("ARCHIVED");
  });

  it("[R2] FAILED: ACTIVE로 전환 가능 (재활성)", () => {
    expect(SOURCE_ALLOWED_TRANSITIONS.FAILED).toContain("ACTIVE");
  });

  it("FAILED: ARCHIVED로 직접 전환 불가 ([R2] 변경)", () => {
    // [R2] 이전에는 ARCHIVED만 허용했으나, 이제 ACTIVE만 허용
    expect(SOURCE_ALLOWED_TRANSITIONS.FAILED).not.toContain("ARCHIVED");
  });

  it("ARCHIVED: terminal — 전환 불가 (빈 배열)", () => {
    expect(SOURCE_ALLOWED_TRANSITIONS.ARCHIVED).toEqual([]);
  });
});

// ============================================================================
// validateSourceTransition
// ============================================================================

describe("validateSourceTransition", () => {
  // 허용 케이스
  it("ACTIVE → PAUSED 허용", () => {
    expect(validateSourceTransition("ACTIVE", "PAUSED")).toBeNull();
  });

  it("ACTIVE → REVIEW 허용", () => {
    expect(validateSourceTransition("ACTIVE", "REVIEW")).toBeNull();
  });

  it("ACTIVE → FAILED 허용", () => {
    expect(validateSourceTransition("ACTIVE", "FAILED")).toBeNull();
  });

  it("PAUSED → ACTIVE 허용", () => {
    expect(validateSourceTransition("PAUSED", "ACTIVE")).toBeNull();
  });

  it("REVIEW → ACTIVE 허용", () => {
    expect(validateSourceTransition("REVIEW", "ACTIVE")).toBeNull();
  });

  it("REVIEW → ARCHIVED 허용", () => {
    expect(validateSourceTransition("REVIEW", "ARCHIVED")).toBeNull();
  });

  it("[R2] FAILED → ACTIVE 허용", () => {
    expect(validateSourceTransition("FAILED", "ACTIVE")).toBeNull();
  });

  // 불허 케이스
  it("ACTIVE → ARCHIVED 불허 (직접 전환 불가)", () => {
    const result = validateSourceTransition("ACTIVE", "ARCHIVED");
    expect(result).not.toBeNull();
    expect(result).toContain("전환");
  });

  it("ARCHIVED → ACTIVE 불허 (terminal)", () => {
    const result = validateSourceTransition("ARCHIVED", "ACTIVE");
    expect(result).not.toBeNull();
  });

  it("ARCHIVED → PAUSED 불허 (terminal)", () => {
    const result = validateSourceTransition("ARCHIVED", "PAUSED");
    expect(result).not.toBeNull();
  });

  it("FAILED → PAUSED 불허", () => {
    const result = validateSourceTransition("FAILED", "PAUSED");
    expect(result).not.toBeNull();
  });

  it("FAILED → REVIEW 불허", () => {
    const result = validateSourceTransition("FAILED", "REVIEW");
    expect(result).not.toBeNull();
  });

  it("알 수 없는 상태 → 에러 메시지 반환", () => {
    const result = validateSourceTransition("UNKNOWN", "ACTIVE");
    expect(result).not.toBeNull();
    expect(result).toContain("알 수 없는");
  });

  it("동일 상태 전환 불허 (ACTIVE → ACTIVE)", () => {
    const result = validateSourceTransition("ACTIVE", "ACTIVE");
    expect(result).not.toBeNull();
  });
});

// ============================================================================
// 상수 정의 검증
// ============================================================================

describe("상수 정의", () => {
  it("COLLECTIBLE_STATUSES: ACTIVE만 포함", () => {
    expect(COLLECTIBLE_STATUSES).toContain("ACTIVE");
    expect(COLLECTIBLE_STATUSES).toHaveLength(1);
  });

  it("ATTENTION_STATUSES: REVIEW, FAILED 포함", () => {
    expect(ATTENTION_STATUSES).toContain("REVIEW");
    expect(ATTENTION_STATUSES).toContain("FAILED");
  });

  it("TERMINAL_SOURCE_STATUSES: ARCHIVED만 포함", () => {
    expect(TERMINAL_SOURCE_STATUSES).toContain("ARCHIVED");
    expect(TERMINAL_SOURCE_STATUSES).toHaveLength(1);
  });

  it("REVIEW_THRESHOLDS: consecutiveFailures=3, failedThreshold=5", () => {
    expect(REVIEW_THRESHOLDS.consecutiveFailures).toBe(3);
    expect(REVIEW_THRESHOLDS.failedThreshold).toBe(5);
    expect(REVIEW_THRESHOLDS.zeroConversionDays).toBe(30);
  });
});
