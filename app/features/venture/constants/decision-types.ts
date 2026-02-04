/**
 * Venture Decision 타입 정의 (4가지)
 */

import type { BadgeProps } from "~/components/ui/Badge";
import type { VdDecisionTypeValue, VdDecisionStatusType } from "../types";

export const VD_DECISION_TYPES = [
  "SCOPE_SELECT",
  "GATE1_SHORTLIST",
  "GATE2_FINAL",
  "PUBLISH_APPROVE",
] as const;

export const VD_DECISION_TYPE_CONFIG: Record<
  VdDecisionTypeValue,
  {
    label: string;
    description: string;
    expectedOutcome: string;
    defaultTimeoutHours: number;
  }
> = {
  SCOPE_SELECT: {
    label: "범위 선택",
    description: "스프린트 산업/범위 확정",
    expectedOutcome: "산업 1~2개 선택",
    defaultTimeoutHours: 24,
  },
  GATE1_SHORTLIST: {
    label: "1차 선별",
    description: "후보 목록에서 선별 목록 선정",
    expectedOutcome: "6~8개 기회 선정",
    defaultTimeoutHours: 48,
  },
  GATE2_FINAL: {
    label: "최종 선정",
    description: "선별 목록에서 최종 선정",
    expectedOutcome: "2~3개 기회 최종 선정",
    defaultTimeoutHours: 48,
  },
  PUBLISH_APPROVE: {
    label: "발행 승인",
    description: "산출물 배포/공유 승인",
    expectedOutcome: "피치/요약문서 승인",
    defaultTimeoutHours: 24,
  },
};

export const VD_DECISION_STATUSES = ["PENDING", "APPROVED", "REJECTED", "TIMEOUT"] as const;

export const VD_DECISION_STATUS_CONFIG: Record<
  VdDecisionStatusType,
  {
    label: string;
    variant: BadgeProps["variant"];
    description: string;
  }
> = {
  PENDING: {
    label: "대기중",
    variant: "warning",
    description: "투표/결정 진행 중",
  },
  APPROVED: {
    label: "승인",
    variant: "success",
    description: "의사결정 승인됨",
  },
  REJECTED: {
    label: "거부",
    variant: "destructive",
    description: "의사결정 거부됨",
  },
  TIMEOUT: {
    label: "시간초과",
    variant: "secondary",
    description: "타임아웃으로 자동 처리됨",
  },
};

/**
 * Decision 타입에 따른 최소 승인 조건
 */
export interface VdApprovalRequirements {
  minVoters: number;
  minApprovalRatio: number; // 0-1
  requireReviewer: boolean;
}

export const VD_APPROVAL_REQUIREMENTS: Record<VdDecisionTypeValue, VdApprovalRequirements> = {
  SCOPE_SELECT: {
    minVoters: 1,
    minApprovalRatio: 1.0, // 전원 동의
    requireReviewer: false,
  },
  GATE1_SHORTLIST: {
    minVoters: 2,
    minApprovalRatio: 0.5, // 과반
    requireReviewer: true,
  },
  GATE2_FINAL: {
    minVoters: 2,
    minApprovalRatio: 0.5, // 과반
    requireReviewer: true,
  },
  PUBLISH_APPROVE: {
    minVoters: 1,
    minApprovalRatio: 1.0,
    requireReviewer: false,
  },
};
