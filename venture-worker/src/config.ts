/**
 * Venture Worker 설정
 */

import type { VdTaskTypeValue } from "./types";

// Task 타입별 설정
export interface TaskTypeConfig {
  label: string;
  description: string;
  defaultPriority: number;
  maxRetries: number;
  timeoutMinutes: number;
}

export const VD_TASK_TYPE_CONFIG: Record<VdTaskTypeValue, TaskTypeConfig> = {
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
    defaultPriority: 10,
    maxRetries: 2,
    timeoutMinutes: 15,
  },
};

