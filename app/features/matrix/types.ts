// ─── Stage-Gate 매핑 ───
export const STAGE_GATE_MAP = {
  activity: "S0",
  signal: "S1",
  scorecard: "S2",
  brief: "S2",
  validation: "S3",
  pilot_ready: "S4",
} as const;

export const STAGE_GATE_LABELS: Record<string, string> = {
  S0: "초기 활동",
  S1: "시그널 탐지",
  S2: "평가/브리프",
  S3: "검증",
  S4: "파일럿",
};

// ─── 스코어 입력 타입 ───
export interface IndividualScoreInput {
  // C-Level (각 1.0 ~ 5.0)
  strategicFit: number;
  profitability: number;
  marketScalability: number;
  brandImpact: number;
  roiExpectation: number;
  // Execution (각 1.0 ~ 5.0)
  feasibility: number;
  techDifficulty: number; // 역수 처리됨 (높을수록 나쁨)
  referenceExists: number;
  resourceAvailable: number;
  riskLevel: number; // 역수 처리됨
  // Optional
  note?: string;
}

// ─── Heatmap 뷰 타입 ───
export interface HeatmapCell {
  cellId: string | null;
  industryId: string;
  industryName: string;
  industryOrder: number;
  functionId: string;
  functionName: string;
  functionOrder: number;
  compositeScore: number | null;
  scoreStatus: string | null;
  pipelineStage: string | null;
  cellStatus: string | null;
  delta: number | null; // 전월 대비 변동
}

export interface HeatmapData {
  industries: Array<{
    id: string;
    name: string;
    nameEn: string | null;
    order: number;
  }>;
  functions: Array<{
    id: string;
    name: string;
    nameEn: string | null;
    category: string;
    order: number;
  }>;
  cells: HeatmapCell[];
  period: string; // YYYY-MM
}

// ─── Cell 상세 뷰 타입 ───
export interface CellDetail {
  id: string;
  industryName: string;
  functionName: string;
  timeHorizon: string;
  pipelineStage: string;
  status: string;
  description: string | null;
  revenuePotential: number | null;
  revenueUnit: string;
  ownerName: string | null;
  priority: number;
  tags: string[];
  latestScore: ConsensusScoreView | null;
  scoreTrend: ScoreTrendEntry[];
  linkedTopics: LinkedTopic[];
  linkedSignals: LinkedSignal[];
}

export interface ConsensusScoreView {
  period: string;
  clevelScore: number;
  executionScore: number;
  signalAdjustment: number;
  compositeScore: number;
  status: string;
  deviation: number | null;
  prevComposite: number | null;
  participantCount: number;
}

export interface ScoreTrendEntry {
  period: string;
  compositeScore: number;
  clevelScore: number;
  executionScore: number;
}

export interface LinkedTopic {
  topicId: string;
  topicName: string;
  relevance: number;
}

export interface LinkedSignal {
  signalId: number;
  summary: string;
  score: number;
  createdAt: Date;
}

// ─── 스코어링 설정 ───
export interface ScoringWeights {
  weightClevel: number; // default 0.4
  weightExecution: number; // default 0.4
  weightSignal: number; // default 0.2
  signalDecayDays: number; // default 90
  minSignalsForAdjust: number; // default 3
  maxSignalAdjustment: number; // default 2.0
  applyIndustryWeight: boolean; // default true
  minVotersForConfirm: number; // default 2
  deviationAlertThreshold: number; // default 1.5
}

// ─── 색상 유틸리티 ───
export type ScoreLevel = "high" | "medium" | "low" | "none";

export function getScoreLevel(score: number | null): ScoreLevel {
  if (score === null) return "none";
  if (score >= 4.0) return "high";
  if (score >= 2.5) return "medium";
  return "low";
}

export function getScoreColor(level: ScoreLevel): string {
  switch (level) {
    case "high":
      return "var(--dx-score-high, #22c55e)";
    case "medium":
      return "var(--dx-score-medium, #eab308)";
    case "low":
      return "var(--dx-score-low, #ef4444)";
    case "none":
      return "var(--dx-score-none, #94a3b8)";
  }
}
