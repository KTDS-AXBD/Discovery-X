/**
 * Sprint State Machine 테스트
 *
 * 테스트 대상:
 * - validateTransition(): 8개 상태 전환 시나리오
 * - getNextPossibleStatuses(): 현재 상태에서 가능한 전환 목록
 * - getSprintProgressSummary(): 진행률 계산
 * - getCurrentDayInfo(): 현재 Day 정보
 */

import { describe, it, expect } from "vitest";
import {
  validateTransition,
  getNextPossibleStatuses,
  getSprintProgressSummary,
  getCurrentDayInfo,
  SPRINT_DAYS,
  type SprintTransitionContext,
} from "~/features/venture/domain/sprint-state-machine";
import type { VdSprintStatusType } from "~/features/venture/types";

// ============================================================================
// 헬퍼: 기본 컨텍스트 생성
// ============================================================================

function createContext(
  overrides: Partial<SprintTransitionContext> = {}
): SprintTransitionContext {
  return {
    currentStatus: "DRAFT",
    selectedScopeCount: 0,
    opportunityCount: 0,
    shortlistCount: 0,
    finalCount: 0,
    pendingDecisionCount: 0,
    ...overrides,
  };
}

// ============================================================================
// validateTransition() 테스트
// ============================================================================

describe("validateTransition", () => {
  describe("정상 전환 (8개)", () => {
    it("DRAFT → RUNNING: scope 선택 시 허용", () => {
      const ctx = createContext({
        currentStatus: "DRAFT",
        selectedScopeCount: 2,
      });
      const result = validateTransition(ctx, "RUNNING");

      expect(result.allowed).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.nextStatus).toBe("RUNNING");
      expect(result.requiresDecision).toBe(false);
    });

    it("RUNNING → GATE1_PENDING: opportunity 6개 이상 시 허용", () => {
      const ctx = createContext({
        currentStatus: "RUNNING",
        opportunityCount: 8,
      });
      const result = validateTransition(ctx, "GATE1_PENDING");

      expect(result.allowed).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.nextStatus).toBe("GATE1_PENDING");
      expect(result.requiresDecision).toBe(true);
      expect(result.decisionType).toBe("GATE1_SHORTLIST");
    });

    it("GATE1_PENDING → DEEPDIVE: shortlist 선정 시 허용", () => {
      const ctx = createContext({
        currentStatus: "GATE1_PENDING",
        shortlistCount: 5,
      });
      const result = validateTransition(ctx, "DEEPDIVE");

      expect(result.allowed).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.nextStatus).toBe("DEEPDIVE");
    });

    it("DEEPDIVE → GATE2_PENDING: shortlist 1개 이상 시 허용", () => {
      const ctx = createContext({
        currentStatus: "DEEPDIVE",
        shortlistCount: 3,
      });
      const result = validateTransition(ctx, "GATE2_PENDING");

      expect(result.allowed).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.nextStatus).toBe("GATE2_PENDING");
      expect(result.requiresDecision).toBe(true);
      expect(result.decisionType).toBe("GATE2_FINAL");
    });

    it("GATE2_PENDING → PACKAGING: final 선정 시 허용", () => {
      const ctx = createContext({
        currentStatus: "GATE2_PENDING",
        finalCount: 2,
      });
      const result = validateTransition(ctx, "PACKAGING");

      expect(result.allowed).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.nextStatus).toBe("PACKAGING");
    });

    it("PACKAGING → COMPLETED: final 있으면 허용", () => {
      const ctx = createContext({
        currentStatus: "PACKAGING",
        finalCount: 2,
      });
      const result = validateTransition(ctx, "COMPLETED");

      expect(result.allowed).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.nextStatus).toBe("COMPLETED");
    });

    it("COMPLETED → ARCHIVED: 항상 허용", () => {
      const ctx = createContext({
        currentStatus: "COMPLETED",
      });
      const result = validateTransition(ctx, "ARCHIVED");

      expect(result.allowed).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.nextStatus).toBe("ARCHIVED");
    });

    it("모든 상태 → ARCHIVED: 강제 종료 허용 (경고만)", () => {
      const statuses: VdSprintStatusType[] = [
        "DRAFT",
        "RUNNING",
        "GATE1_PENDING",
        "DEEPDIVE",
        "GATE2_PENDING",
        "PACKAGING",
      ];

      for (const status of statuses) {
        const ctx = createContext({ currentStatus: status });
        const result = validateTransition(ctx, "ARCHIVED");

        expect(result.allowed).toBe(true);
        expect(result.errors).toHaveLength(0);
        // COMPLETED가 아닌 상태에서는 경고
        expect(result.warnings.length).toBeGreaterThan(0);
      }
    });
  });

  describe("조건 미충족 전환 실패 (8개)", () => {
    it("DRAFT → RUNNING: scope 미선택 시 실패", () => {
      const ctx = createContext({
        currentStatus: "DRAFT",
        selectedScopeCount: 0,
      });
      const result = validateTransition(ctx, "RUNNING");

      expect(result.allowed).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.nextStatus).toBeNull();
    });

    it("RUNNING → GATE1_PENDING: opportunity 부족 시 실패", () => {
      const ctx = createContext({
        currentStatus: "RUNNING",
        opportunityCount: 3,
      });
      const result = validateTransition(ctx, "GATE1_PENDING");

      expect(result.allowed).toBe(false);
      expect(result.errors.some((e) => e.includes("최소") && e.includes("6"))).toBe(true);
      expect(result.nextStatus).toBeNull();
    });

    it("RUNNING → GATE1_PENDING: pending decision 있으면 경고", () => {
      const ctx = createContext({
        currentStatus: "RUNNING",
        opportunityCount: 10,
        pendingDecisionCount: 2,
      });
      const result = validateTransition(ctx, "GATE1_PENDING");

      expect(result.allowed).toBe(true);
      expect(result.warnings.some((w) => w.includes("의사결정"))).toBe(true);
    });

    it("GATE1_PENDING → DEEPDIVE: shortlist 미선정 시 실패", () => {
      const ctx = createContext({
        currentStatus: "GATE1_PENDING",
        shortlistCount: 0,
      });
      const result = validateTransition(ctx, "DEEPDIVE");

      expect(result.allowed).toBe(false);
      expect(result.errors.some((e) => e.includes("Shortlist"))).toBe(true);
    });

    it("DEEPDIVE → GATE2_PENDING: shortlist 0개면 실패", () => {
      const ctx = createContext({
        currentStatus: "DEEPDIVE",
        shortlistCount: 0,
      });
      const result = validateTransition(ctx, "GATE2_PENDING");

      expect(result.allowed).toBe(false);
      expect(result.errors.some((e) => e.includes("Shortlist"))).toBe(true);
    });

    it("GATE2_PENDING → PACKAGING: final 미선정 시 실패", () => {
      const ctx = createContext({
        currentStatus: "GATE2_PENDING",
        finalCount: 0,
      });
      const result = validateTransition(ctx, "PACKAGING");

      expect(result.allowed).toBe(false);
      expect(result.errors.some((e) => e.includes("Final"))).toBe(true);
    });

    it("PACKAGING → COMPLETED: final 0개면 경고 (허용은 됨)", () => {
      const ctx = createContext({
        currentStatus: "PACKAGING",
        finalCount: 0,
      });
      const result = validateTransition(ctx, "COMPLETED");

      expect(result.allowed).toBe(true);
      expect(result.warnings.some((w) => w.includes("Final"))).toBe(true);
    });

    it("ARCHIVED에서 어떤 전환도 불가", () => {
      const ctx = createContext({ currentStatus: "ARCHIVED" });

      const statuses: VdSprintStatusType[] = [
        "DRAFT",
        "RUNNING",
        "GATE1_PENDING",
        "DEEPDIVE",
        "COMPLETED",
      ];

      for (const status of statuses) {
        const result = validateTransition(ctx, status);
        expect(result.allowed).toBe(false);
      }
    });
  });

  describe("잘못된 전환 거부 (5개)", () => {
    it("DRAFT → DEEPDIVE: 건너뛰기 불가", () => {
      const ctx = createContext({ currentStatus: "DRAFT" });
      const result = validateTransition(ctx, "DEEPDIVE");

      expect(result.allowed).toBe(false);
      expect(result.errors.some((e) => e.includes("전환"))).toBe(true);
    });

    it("RUNNING → PACKAGING: 건너뛰기 불가", () => {
      const ctx = createContext({ currentStatus: "RUNNING" });
      const result = validateTransition(ctx, "PACKAGING");

      expect(result.allowed).toBe(false);
    });

    it("DEEPDIVE → RUNNING: 역방향 전환 불가", () => {
      const ctx = createContext({ currentStatus: "DEEPDIVE" });
      const result = validateTransition(ctx, "RUNNING");

      expect(result.allowed).toBe(false);
    });

    it("COMPLETED → RUNNING: 완료 후 재시작 불가", () => {
      const ctx = createContext({ currentStatus: "COMPLETED" });
      const result = validateTransition(ctx, "RUNNING");

      expect(result.allowed).toBe(false);
    });

    it("GATE1_PENDING → GATE2_PENDING: Gate 건너뛰기 불가", () => {
      const ctx = createContext({ currentStatus: "GATE1_PENDING" });
      const result = validateTransition(ctx, "GATE2_PENDING");

      expect(result.allowed).toBe(false);
    });
  });
});

// ============================================================================
// getNextPossibleStatuses() 테스트
// ============================================================================

describe("getNextPossibleStatuses", () => {
  it("DRAFT에서 RUNNING과 ARCHIVED로 전환 가능", () => {
    const statuses = getNextPossibleStatuses("DRAFT");
    expect(statuses).toContain("RUNNING");
    expect(statuses).toContain("ARCHIVED");
    expect(statuses).toHaveLength(2);
  });

  it("RUNNING에서 GATE1_PENDING과 ARCHIVED로 전환 가능", () => {
    const statuses = getNextPossibleStatuses("RUNNING");
    expect(statuses).toContain("GATE1_PENDING");
    expect(statuses).toContain("ARCHIVED");
  });

  it("GATE1_PENDING에서 DEEPDIVE와 ARCHIVED로 전환 가능", () => {
    const statuses = getNextPossibleStatuses("GATE1_PENDING");
    expect(statuses).toContain("DEEPDIVE");
    expect(statuses).toContain("ARCHIVED");
  });

  it("COMPLETED에서 ARCHIVED만 전환 가능", () => {
    const statuses = getNextPossibleStatuses("COMPLETED");
    expect(statuses).toEqual(["ARCHIVED"]);
  });

  it("ARCHIVED에서 전환 불가 (빈 배열)", () => {
    const statuses = getNextPossibleStatuses("ARCHIVED");
    expect(statuses).toEqual([]);
  });
});

// ============================================================================
// getSprintProgressSummary() 테스트
// ============================================================================

describe("getSprintProgressSummary", () => {
  it("DRAFT 상태에서 progress 0%", () => {
    const ctx = createContext({ currentStatus: "DRAFT", selectedScopeCount: 1 });
    const summary = getSprintProgressSummary(ctx);

    expect(summary.currentStatus).toBe("DRAFT");
    expect(summary.progress).toBe(0);
    expect(summary.currentDay).toBeNull();
    expect(summary.isTerminal).toBe(false);
  });

  it("RUNNING 상태에서 progress 20%", () => {
    const ctx = createContext({
      currentStatus: "RUNNING",
      opportunityCount: 10,
    });
    const summary = getSprintProgressSummary(ctx);

    expect(summary.progress).toBe(20);
    expect(summary.currentDay).toBe(1);
    expect(summary.canProceed).toBe(true);
  });

  it("DEEPDIVE 상태에서 progress 55%", () => {
    const ctx = createContext({
      currentStatus: "DEEPDIVE",
      shortlistCount: 5,
    });
    const summary = getSprintProgressSummary(ctx);

    expect(summary.progress).toBe(55);
    expect(summary.currentDay).toBe(3);
  });

  it("COMPLETED는 terminal 상태", () => {
    const ctx = createContext({ currentStatus: "COMPLETED" });
    const summary = getSprintProgressSummary(ctx);

    expect(summary.isTerminal).toBe(true);
    expect(summary.progress).toBe(100);
  });

  it("ARCHIVED는 terminal 상태", () => {
    const ctx = createContext({ currentStatus: "ARCHIVED" });
    const summary = getSprintProgressSummary(ctx);

    expect(summary.isTerminal).toBe(true);
    expect(summary.progress).toBe(100);
  });

  it("조건 미충족 시 canProceed = false", () => {
    const ctx = createContext({
      currentStatus: "RUNNING",
      opportunityCount: 2, // 6개 미만
    });
    const summary = getSprintProgressSummary(ctx);

    expect(summary.canProceed).toBe(false);
  });
});

// ============================================================================
// getCurrentDayInfo() 테스트
// ============================================================================

describe("getCurrentDayInfo", () => {
  it("RUNNING 상태에서 Day 1 정보 반환", () => {
    const dayInfo = getCurrentDayInfo("RUNNING");

    expect(dayInfo).not.toBeNull();
    expect(dayInfo?.day).toBe(1);
    expect(dayInfo?.name).toContain("Kickoff");
    expect(dayInfo?.activities.some((a) => a.includes("Signal"))).toBe(true);
  });

  it("DEEPDIVE 상태에서 Day 3 정보 반환", () => {
    const dayInfo = getCurrentDayInfo("DEEPDIVE");

    expect(dayInfo).not.toBeNull();
    expect(dayInfo?.day).toBe(3);
    expect(dayInfo?.name).toContain("Deep Dive");
  });

  it("PACKAGING 상태에서 Day 5 정보 반환", () => {
    const dayInfo = getCurrentDayInfo("PACKAGING");

    expect(dayInfo).not.toBeNull();
    expect(dayInfo?.day).toBe(5);
    expect(dayInfo?.name).toContain("Package");
  });

  it("DRAFT 상태에서 null 반환", () => {
    const dayInfo = getCurrentDayInfo("DRAFT");
    expect(dayInfo).toBeNull();
  });

  it("COMPLETED 상태에서 null 반환", () => {
    const dayInfo = getCurrentDayInfo("COMPLETED");
    expect(dayInfo).toBeNull();
  });
});

// ============================================================================
// SPRINT_DAYS 상수 테스트
// ============================================================================

describe("SPRINT_DAYS", () => {
  it("5일 스프린트 정의", () => {
    expect(SPRINT_DAYS).toHaveLength(5);
  });

  it("각 Day에 필수 필드 포함", () => {
    for (const day of SPRINT_DAYS) {
      expect(day.day).toBeGreaterThanOrEqual(1);
      expect(day.day).toBeLessThanOrEqual(5);
      expect(day.name).toBeTruthy();
      expect(day.description).toBeTruthy();
      expect(day.expectedStatus).toBeTruthy();
      expect(day.activities.length).toBeGreaterThan(0);
    }
  });

  it("Day 순서 정렬 확인", () => {
    for (let i = 0; i < SPRINT_DAYS.length; i++) {
      expect(SPRINT_DAYS[i].day).toBe(i + 1);
    }
  });
});
