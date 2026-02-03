/**
 * Venture Sprint 상태 머신
 *
 * 상태 흐름:
 * DRAFT → RUNNING → GATE1_PENDING → DEEPDIVE → GATE2_PENDING → PACKAGING → COMPLETED → ARCHIVED
 */

import type { VdSprintStatusType } from "../types";
import {
  VD_SPRINT_ALLOWED_TRANSITIONS,
  canTransitionSprintTo,
  getSprintProgress,
  getSprintDay,
} from "../constants/sprint-status";
import { validateSprintStart, validateGate1Entry, validateGate2Entry } from "../schemas/sprint.schema";

// ============================================================================
// TRANSITION CONTEXT
// ============================================================================

export interface SprintTransitionContext {
  currentStatus: VdSprintStatusType;
  selectedScopeCount: number;
  opportunityCount: number;
  shortlistCount: number;
  finalCount: number;
  pendingDecisionCount: number;
}

export interface TransitionResult {
  allowed: boolean;
  errors: string[];
  warnings: string[];
  nextStatus: VdSprintStatusType | null;
  requiresDecision: boolean;
  decisionType?: string;
}

// ============================================================================
// STATE MACHINE
// ============================================================================

/**
 * 상태 전환 가능 여부 및 조건 검증
 */
export function validateTransition(
  context: SprintTransitionContext,
  targetStatus: VdSprintStatusType
): TransitionResult {
  const { currentStatus } = context;
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. 기본 전환 가능 여부 확인
  if (!canTransitionSprintTo(currentStatus, targetStatus)) {
    return {
      allowed: false,
      errors: [`${currentStatus}에서 ${targetStatus}로 전환할 수 없습니다`],
      warnings: [],
      nextStatus: null,
      requiresDecision: false,
    };
  }

  // 2. 상태별 추가 조건 검증
  switch (targetStatus) {
    case "RUNNING": {
      const validation = validateSprintStart(
        Array.from({ length: context.selectedScopeCount }, () => ({ selected: true }))
      );
      if (!validation.valid) {
        errors.push(...validation.errors);
      }
      break;
    }

    case "GATE1_PENDING": {
      const validation = validateGate1Entry(context.opportunityCount);
      if (!validation.valid) {
        errors.push(...validation.errors);
      }
      if (context.pendingDecisionCount > 0) {
        warnings.push("아직 완료되지 않은 의사결정이 있습니다");
      }
      break;
    }

    case "DEEPDIVE": {
      // Gate1 결정이 완료되어야 함
      if (context.shortlistCount === 0) {
        errors.push("Gate 1에서 Shortlist를 선정해야 합니다");
      }
      break;
    }

    case "GATE2_PENDING": {
      const validation = validateGate2Entry(context.shortlistCount);
      if (!validation.valid) {
        errors.push(...validation.errors);
      }
      break;
    }

    case "PACKAGING": {
      // Gate2 결정이 완료되어야 함
      if (context.finalCount === 0) {
        errors.push("Gate 2에서 Final을 선정해야 합니다");
      }
      break;
    }

    case "COMPLETED": {
      // 패키징이 완료되어야 함 (최소 1개 artifact)
      if (context.finalCount === 0) {
        warnings.push("Final 기회가 없습니다");
      }
      break;
    }

    case "ARCHIVED": {
      // 언제든 가능 (강제 종료)
      if (currentStatus !== "COMPLETED") {
        warnings.push("완료되지 않은 스프린트를 아카이브합니다");
      }
      break;
    }
  }

  // 3. 결정 필요 여부 확인
  const requiresDecision = targetStatus === "GATE1_PENDING" || targetStatus === "GATE2_PENDING";
  const decisionType = targetStatus === "GATE1_PENDING"
    ? "GATE1_SHORTLIST"
    : targetStatus === "GATE2_PENDING"
      ? "GATE2_FINAL"
      : undefined;

  return {
    allowed: errors.length === 0,
    errors,
    warnings,
    nextStatus: errors.length === 0 ? targetStatus : null,
    requiresDecision,
    decisionType,
  };
}

/**
 * 다음 가능한 상태 목록 조회
 */
export function getNextPossibleStatuses(currentStatus: VdSprintStatusType): VdSprintStatusType[] {
  return VD_SPRINT_ALLOWED_TRANSITIONS[currentStatus] || [];
}

/**
 * 스프린트 진행 상태 요약
 */
export interface SprintProgressSummary {
  currentStatus: VdSprintStatusType;
  progress: number; // 0-100
  currentDay: number | null;
  nextStatuses: VdSprintStatusType[];
  isTerminal: boolean;
  canProceed: boolean;
}

export function getSprintProgressSummary(
  context: SprintTransitionContext
): SprintProgressSummary {
  const { currentStatus } = context;
  const progress = getSprintProgress(currentStatus);
  const currentDay = getSprintDay(currentStatus);
  const nextStatuses = getNextPossibleStatuses(currentStatus);
  const isTerminal = currentStatus === "COMPLETED" || currentStatus === "ARCHIVED";

  // 다음 상태로 진행 가능한지 확인
  let canProceed = false;
  if (!isTerminal && nextStatuses.length > 0) {
    // ARCHIVED가 아닌 다음 상태가 있고, 전환 가능한지 확인
    const mainNext = nextStatuses.find((s) => s !== "ARCHIVED");
    if (mainNext) {
      const validation = validateTransition(context, mainNext);
      canProceed = validation.allowed;
    }
  }

  return {
    currentStatus,
    progress,
    currentDay,
    nextStatuses,
    isTerminal,
    canProceed,
  };
}

// ============================================================================
// DAY-BY-DAY MAPPING
// ============================================================================

export interface DayInfo {
  day: number;
  name: string;
  description: string;
  expectedStatus: VdSprintStatusType;
  activities: string[];
}

export const SPRINT_DAYS: DayInfo[] = [
  {
    day: 1,
    name: "Day 1: Kickoff",
    description: "Scope 확정 및 Signal 수집 시작",
    expectedStatus: "RUNNING",
    activities: [
      "산업/범위 확정 (HITL)",
      "Signal 자동 수집 시작",
      "Problem 정의",
      "Long List v1 생성",
    ],
  },
  {
    day: 2,
    name: "Day 2: Refine",
    description: "카드 정제 및 Gate1 준비",
    expectedStatus: "RUNNING",
    activities: [
      "누락 필드 탐지/보완",
      "테마 클러스터링",
      "스코어링 초안",
      "Gate1 블라인드 점수 입력",
    ],
  },
  {
    day: 3,
    name: "Day 3: Deep Dive Start",
    description: "Shortlist 선정 및 Deep Dive 시작",
    expectedStatus: "DEEPDIVE",
    activities: [
      "Gate1 투표 집계",
      "Shortlist 6~8개 확정",
      "Assumption Map 작성",
      "Pre-mortem 작성",
    ],
  },
  {
    day: 4,
    name: "Day 4: Deep Dive Complete",
    description: "Deep Dive 완료 및 Gate2 준비",
    expectedStatus: "DEEPDIVE",
    activities: [
      "Lean Canvas 초안",
      "Deep Dive 정제",
      "Gate2 평가 준비",
      "Gate2 블라인드 점수 입력",
    ],
  },
  {
    day: 5,
    name: "Day 5: Package",
    description: "Final 선정 및 패키징",
    expectedStatus: "PACKAGING",
    activities: [
      "Gate2 투표 집계",
      "Final 2~3개 확정",
      "피치 덱 작성",
      "요약 문서 완성",
      "Q&A 레드팀",
    ],
  },
];

/**
 * 현재 Day 정보 조회
 */
export function getCurrentDayInfo(status: VdSprintStatusType): DayInfo | null {
  const day = getSprintDay(status);
  if (day === null) return null;
  return SPRINT_DAYS.find((d) => d.day === day) || null;
}
