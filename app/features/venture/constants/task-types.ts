/**
 * Venture Task Queue 타입 정의 (8가지)
 */

import type { VdTaskTypeValue, VdTaskStatusType } from "../types";

export const VD_TASK_TYPES = [
  "COLLECT_SIGNALS",
  "ANALYZE_PROBLEMS",
  "GENERATE_OPPORTUNITIES",
  "CLUSTER_THEMES",
  "SCORE_OPPORTUNITIES",
  "GENERATE_DEEPDIVE",
  "GENERATE_ARTIFACTS",
  "PREPARE_GATE",
] as const;

export interface VdTaskTypeConfig {
  label: string;
  description: string;
  defaultPriority: number; // 높을수록 우선
  maxRetries: number;
  timeoutMinutes: number;
}

export const VD_TASK_TYPE_CONFIG: Record<VdTaskTypeValue, VdTaskTypeConfig> = {
  COLLECT_SIGNALS: {
    label: "신호 수집",
    description: "외부 소스에서 신호를 수집하고 정제",
    defaultPriority: 10,
    maxRetries: 3,
    timeoutMinutes: 30,
  },
  ANALYZE_PROBLEMS: {
    label: "문제 분석",
    description: "수집된 신호에서 문제를 추출하고 분석",
    defaultPriority: 9,
    maxRetries: 3,
    timeoutMinutes: 20,
  },
  GENERATE_OPPORTUNITIES: {
    label: "기회 생성",
    description: "문제에서 기회 카드를 생성",
    defaultPriority: 8,
    maxRetries: 3,
    timeoutMinutes: 30,
  },
  CLUSTER_THEMES: {
    label: "테마 클러스터링",
    description: "기회들을 테마별로 클러스터링",
    defaultPriority: 7,
    maxRetries: 3,
    timeoutMinutes: 15,
  },
  SCORE_OPPORTUNITIES: {
    label: "기회 스코어링",
    description: "기회 카드에 점수 부여",
    defaultPriority: 6,
    maxRetries: 3,
    timeoutMinutes: 20,
  },
  GENERATE_DEEPDIVE: {
    label: "Deep Dive 생성",
    description: "Assumption/Pre-mortem/Lean Canvas 초안 생성",
    defaultPriority: 5,
    maxRetries: 3,
    timeoutMinutes: 45,
  },
  GENERATE_ARTIFACTS: {
    label: "산출물 생성",
    description: "피치 덱, 요약 문서 등 산출물 생성",
    defaultPriority: 4,
    maxRetries: 3,
    timeoutMinutes: 60,
  },
  PREPARE_GATE: {
    label: "Gate 준비",
    description: "Gate 의사결정을 위한 자료 준비",
    defaultPriority: 10, // Gate 준비는 최우선
    maxRetries: 2,
    timeoutMinutes: 15,
  },
};

export const VD_TASK_STATUSES = ["PENDING", "RUNNING", "COMPLETED", "FAILED"] as const;

export const VD_TASK_STATUS_CONFIG: Record<
  VdTaskStatusType,
  {
    label: string;
    isFinal: boolean;
  }
> = {
  PENDING: {
    label: "대기중",
    isFinal: false,
  },
  RUNNING: {
    label: "실행중",
    isFinal: false,
  },
  COMPLETED: {
    label: "완료",
    isFinal: true,
  },
  FAILED: {
    label: "실패",
    isFinal: true,
  },
};

/**
 * Task 타입별 입력 스키마 정의
 */
export interface VdTaskPayload {
  COLLECT_SIGNALS: {
    sprintId: string;
    scopeIds?: string[];
    sources?: string[];
  };
  ANALYZE_PROBLEMS: {
    sprintId: string;
    signalIds: string[];
  };
  GENERATE_OPPORTUNITIES: {
    sprintId: string;
    problemIds: string[];
  };
  CLUSTER_THEMES: {
    sprintId: string;
    opportunityIds: string[];
  };
  SCORE_OPPORTUNITIES: {
    sprintId: string;
    opportunityIds: string[];
    presetId?: string;
  };
  GENERATE_DEEPDIVE: {
    sprintId: string;
    opportunityIds: string[];
  };
  GENERATE_ARTIFACTS: {
    sprintId: string;
    opportunityIds: string[];
    artifactTypes: string[];
  };
  PREPARE_GATE: {
    sprintId: string;
    gateType: "GATE1" | "GATE2";
  };
}

/**
 * Task 생성 시 기본 재시도 횟수 가져오기
 */
export function getTaskMaxRetries(taskType: VdTaskTypeValue): number {
  return VD_TASK_TYPE_CONFIG[taskType].maxRetries;
}

/**
 * Task 생성 시 기본 우선순위 가져오기
 */
export function getTaskDefaultPriority(taskType: VdTaskTypeValue): number {
  return VD_TASK_TYPE_CONFIG[taskType].defaultPriority;
}
