import type { BadgeProps } from "~/components/ui/Badge";
import { SourceStatus } from "~/features/radar/db/schema";

// ============================================================================
// SOURCE STATUS CONFIG (UI 표시용)
// ============================================================================

export const SOURCE_STATUS_CONFIG: Record<
  string,
  {
    label: string;
    variant: BadgeProps["variant"];
    description: string;
  }
> = {
  ACTIVE: {
    label: "활성",
    variant: "success",
    description: "정상 수집 중",
  },
  PAUSED: {
    label: "일시정지",
    variant: "secondary",
    description: "사용자가 수동으로 일시정지",
  },
  REVIEW: {
    label: "검토 필요",
    variant: "warning",
    description: "건강도 임계치 도달 또는 반복 실패 — 사용자 확인 필요",
  },
  ARCHIVED: {
    label: "보관됨",
    variant: "secondary",
    description: "영구 비활성 — 수집 중단",
  },
  FAILED: {
    label: "실패",
    variant: "destructive",
    description: "5회 연속 fetch 실패 — 자동 수집 중단",
  },
};

// ============================================================================
// SOURCE LIFECYCLE TRANSITIONS (DX-PLAN-009 §3.4)
// ============================================================================
//
// ACTIVE  → PAUSED   사용자 수동 일시정지
// ACTIVE  → REVIEW   건강도 임계치 / fetch 실패 반복 / 전환 0건 장기
// ACTIVE  → FAILED   5회 연속 fetch 실패 (시스템 자동)
// PAUSED  → ACTIVE   사용자 재시작
// REVIEW  → ACTIVE   사용자 확인 후 복구
// REVIEW  → ARCHIVED 사용자 판단으로 폐기
// FAILED  → ARCHIVED 실패 소스 정리
// ARCHIVED → (없음)  terminal

export const SOURCE_ALLOWED_TRANSITIONS: Record<string, string[]> = {
  [SourceStatus.ACTIVE]: [
    SourceStatus.PAUSED,
    SourceStatus.REVIEW,
    SourceStatus.FAILED,
  ],
  [SourceStatus.PAUSED]: [SourceStatus.ACTIVE],
  [SourceStatus.REVIEW]: [SourceStatus.ACTIVE, SourceStatus.ARCHIVED],
  [SourceStatus.FAILED]: [SourceStatus.ARCHIVED],
  [SourceStatus.ARCHIVED]: [],
};

// ============================================================================
// LIFECYCLE HELPERS
// ============================================================================

/** 수집이 실행되는 상태 */
export const COLLECTIBLE_STATUSES = [
  SourceStatus.ACTIVE,
] as const;

/** 운영자 액션이 필요한 상태 */
export const ATTENTION_STATUSES = [
  SourceStatus.REVIEW,
  SourceStatus.FAILED,
] as const;

/** Terminal 상태 (전환 불가) */
export const TERMINAL_SOURCE_STATUSES = [
  SourceStatus.ARCHIVED,
] as const;

/** 전환 유효성 검사 — 허용되지 않은 전환이면 에러 메시지 반환 */
export function validateSourceTransition(
  from: string,
  to: string,
): string | null {
  const allowed = SOURCE_ALLOWED_TRANSITIONS[from];
  if (!allowed) {
    return `알 수 없는 소스 상태: ${from}`;
  }
  if (!allowed.includes(to)) {
    const fromLabel = SOURCE_STATUS_CONFIG[from]?.label ?? from;
    const toLabel = SOURCE_STATUS_CONFIG[to]?.label ?? to;
    return `${fromLabel}(${from}) → ${toLabel}(${to}) 전환은 허용되지 않아요`;
  }
  return null;
}

/** REVIEW 자동 전환 판단 기준 */
export const REVIEW_THRESHOLDS = {
  /** 연속 fetch 실패 횟수 → REVIEW 진입 */
  consecutiveFailures: 3,
  /** 연속 fetch 실패 횟수 → FAILED 진입 */
  failedThreshold: 5,
  /** 전환 0건 유지 일수 → REVIEW 진입 */
  zeroConversionDays: 30,
} as const;
