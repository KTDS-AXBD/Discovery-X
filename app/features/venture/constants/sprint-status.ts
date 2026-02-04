/**
 * Venture Sprint 상태 정의 (8단계)
 */

import type { BadgeProps } from "~/components/ui/Badge";
import type { VdSprintStatusType } from "../types";

export const VD_SPRINT_STATUSES = [
  "DRAFT",
  "RUNNING",
  "GATE1_PENDING",
  "DEEPDIVE",
  "GATE2_PENDING",
  "PACKAGING",
  "COMPLETED",
  "ARCHIVED",
] as const;

export const VD_SPRINT_STATUS_CONFIG: Record<
  VdSprintStatusType,
  {
    label: string;
    variant: BadgeProps["variant"];
    description: string;
    order: number;
  }
> = {
  DRAFT: {
    label: "준비 중",
    variant: "secondary",
    description: "스프린트 설정 중",
    order: 1,
  },
  RUNNING: {
    label: "진행 중",
    variant: "info",
    description: "Day 1-2: 신호 수집 및 후보 목록 작성",
    order: 2,
  },
  GATE1_PENDING: {
    label: "1차 검토",
    variant: "warning",
    description: "선별 목록 선정을 위한 투표 진행 중",
    order: 3,
  },
  DEEPDIVE: {
    label: "심층 분석",
    variant: "purple",
    description: "Day 3-4: Assumption/Pre-mortem/Lean Canvas 작성",
    order: 4,
  },
  GATE2_PENDING: {
    label: "2차 검토",
    variant: "warning",
    description: "최종 선정을 위한 투표 진행 중",
    order: 5,
  },
  PACKAGING: {
    label: "산출물 정리",
    variant: "success",
    description: "Day 5: 피치/요약문서 작성",
    order: 6,
  },
  COMPLETED: {
    label: "완료",
    variant: "success",
    description: "스프린트 완료",
    order: 7,
  },
  ARCHIVED: {
    label: "보관됨",
    variant: "secondary",
    description: "보관됨",
    order: 8,
  },
};

/**
 * 허용된 상태 전환 맵 (from → to[])
 */
export const VD_SPRINT_ALLOWED_TRANSITIONS: Record<VdSprintStatusType, VdSprintStatusType[]> = {
  DRAFT: ["RUNNING", "ARCHIVED"],
  RUNNING: ["GATE1_PENDING", "ARCHIVED"],
  GATE1_PENDING: ["DEEPDIVE", "ARCHIVED"],
  DEEPDIVE: ["GATE2_PENDING", "ARCHIVED"],
  GATE2_PENDING: ["PACKAGING", "ARCHIVED"],
  PACKAGING: ["COMPLETED", "ARCHIVED"],
  COMPLETED: ["ARCHIVED"],
  ARCHIVED: [],
};

/**
 * 상태 전환 가능 여부 확인
 */
export function canTransitionSprintTo(
  currentStatus: VdSprintStatusType,
  targetStatus: VdSprintStatusType
): boolean {
  const allowed = VD_SPRINT_ALLOWED_TRANSITIONS[currentStatus];
  return allowed.includes(targetStatus);
}

/**
 * 상태별 진행률 (0-100)
 */
export function getSprintProgress(status: VdSprintStatusType): number {
  const progressMap: Record<VdSprintStatusType, number> = {
    DRAFT: 0,
    RUNNING: 20,
    GATE1_PENDING: 35,
    DEEPDIVE: 55,
    GATE2_PENDING: 70,
    PACKAGING: 85,
    COMPLETED: 100,
    ARCHIVED: 100,
  };
  return progressMap[status];
}

/**
 * 스프린트 Day 계산 (RUNNING 상태 기준)
 */
export function getSprintDay(status: VdSprintStatusType): number | null {
  const dayMap: Record<VdSprintStatusType, number | null> = {
    DRAFT: null,
    RUNNING: 1, // Day 1-2
    GATE1_PENDING: 2,
    DEEPDIVE: 3, // Day 3-4
    GATE2_PENDING: 4,
    PACKAGING: 5,
    COMPLETED: null,
    ARCHIVED: null,
  };
  return dayMap[status];
}
