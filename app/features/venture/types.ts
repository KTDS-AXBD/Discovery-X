/**
 * Venture Discovery Sprint - 공유 타입 정의
 */

import type {
  VdSprint,
  VdSprintScope,
  VdSignal,
  VdProblem,
  VdTheme,
  VdOpportunity,
  VdEvidence,
  VdAssumption,
  VdPremortem,
  VdArtifact,
  VdDecision,
  VdVote,
  VdScore,
  VdWorkEvent,
  VdAnalyticsSnapshot,
  VdTaskQueueItem,
} from "./db/schema";

// Re-export DB types
export type {
  VdSprint,
  VdSprintScope,
  VdSignal,
  VdProblem,
  VdTheme,
  VdOpportunity,
  VdEvidence,
  VdAssumption,
  VdPremortem,
  VdArtifact,
  VdDecision,
  VdVote,
  VdScore,
  VdWorkEvent,
  VdAnalyticsSnapshot,
  VdTaskQueueItem,
};

// ============================================================================
// SPRINT STATUS
// ============================================================================

export type VdSprintStatusType =
  | "DRAFT"
  | "RUNNING"
  | "GATE1_PENDING"
  | "DEEPDIVE"
  | "GATE2_PENDING"
  | "PACKAGING"
  | "COMPLETED"
  | "ARCHIVED";

// ============================================================================
// DECISION TYPES
// ============================================================================

export type VdDecisionTypeValue =
  | "SCOPE_SELECT"
  | "GATE1_SHORTLIST"
  | "GATE2_FINAL"
  | "PUBLISH_APPROVE";

export type VdDecisionStatusType = "PENDING" | "APPROVED" | "REJECTED" | "TIMEOUT";

// ============================================================================
// RECOMMENDATION
// ============================================================================

export type VdRecommendationType = "INVEST" | "EXPLORE" | "HOLD" | "DROP";

// ============================================================================
// TASK TYPES
// ============================================================================

export type VdTaskTypeValue =
  | "COLLECT_SIGNALS"
  | "ANALYZE_PROBLEMS"
  | "GENERATE_OPPORTUNITIES"
  | "CLUSTER_THEMES"
  | "SCORE_OPPORTUNITIES"
  | "GENERATE_DEEPDIVE"
  | "GENERATE_ARTIFACTS"
  | "PREPARE_GATE";

export type VdTaskStatusType = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";

// ============================================================================
// SIGNAL & EVIDENCE
// ============================================================================

export type VdSignalTypeValue =
  | "TREND"
  | "NEWS"
  | "RESEARCH"
  | "COMPETITOR"
  | "INTERNAL"
  | "USER_FEEDBACK";

export type VdEvidenceTypeValue =
  | "DATA"
  | "USER_QUOTE"
  | "ARTIFACT"
  | "RESEARCH"
  | "ASSUMPTION";

export type VdEvidenceStrengthValue = "A" | "B" | "C" | "D";

// ============================================================================
// ARTIFACT
// ============================================================================

export type VdArtifactTypeValue =
  | "LEAN_CANVAS"
  | "PITCH_DECK"
  | "ONE_PAGER"
  | "EXECUTIVE_SUMMARY"
  | "CUSTOM";

// ============================================================================
// SCORE DIMENSIONS
// ============================================================================

export type VdScoreDimension = "potential" | "confidence" | "depth" | "effort";

export type VdScoreSource = "agent" | "human" | "aggregated";

// ============================================================================
// WORK EVENT ACTOR
// ============================================================================

export type VdActorType = "agent" | "human";

export type VdEntityType =
  | "sprint"
  | "signal"
  | "problem"
  | "theme"
  | "opportunity"
  | "decision"
  | "artifact"
  | "evidence"
  | "assumption"
  | "premortem"
  | "vote"
  | "task";

// ============================================================================
// ANALYTICS
// ============================================================================

export interface VdFunnelData {
  signals: number;
  problems: number;
  opportunities: number;
  shortlist: number;
  final: number;
}

export interface VdDomainDistribution {
  domain: string;
  count: number;
  depthScore: number;
  effortScore: number;
}

export interface VdEffortByActor {
  agent: number;
  human: number;
}

export interface VdBottleneck {
  decisionId: string;
  pendingHours: number;
}

export interface VdThemeDistribution {
  id: string;
  name: string;
  count: number;
  depthScore: number;
}

export interface VdOpportunityScoreData {
  id: string;
  title: string;
  depthBreakdown: VdDepthScoreBreakdown;
  nextRoi: {
    recommendation: VdRecommendationType;
    rationale: string;
    scores: {
      potential: number;
      confidence: number;
      investmentValue: number;
      unknownPenalty: number;
    };
  };
}

export interface VdRankedOpportunity {
  id: string;
  rank: number;
  compositeScore: number;
}

export interface VdAnalyticsData {
  computedAt?: string;
  type?: string;
  funnel?: VdFunnelData;
  domainDistribution?: VdDomainDistribution[];
  themeDistribution?: VdThemeDistribution[];
  effortByActor?: VdEffortByActor;
  bottlenecks?: VdBottleneck[];
  opportunityScores?: VdOpportunityScoreData[];
  rankedOpportunities?: VdRankedOpportunity[];
}

// ============================================================================
// DEPTH SCORE COMPONENTS (0-100)
// ============================================================================

export interface VdDepthScoreBreakdown {
  evidenceDepth: number; // 0-40
  assumptionCoverage: number; // 0-25
  riskReadiness: number; // 0-15
  executionClarity: number; // 0-20
  total: number; // 0-100
}

// ============================================================================
// SPRINT FULL (with relations)
// ============================================================================

export interface VdSprintFull extends VdSprint {
  scopes: VdSprintScope[];
  signals: VdSignal[];
  problems: VdProblem[];
  themes: VdTheme[];
  opportunities: VdOpportunity[];
  decisions: VdDecision[];
}

export interface VdOpportunityFull extends VdOpportunity {
  evidences: VdEvidence[];
  assumptions: VdAssumption[];
  premortems: VdPremortem[];
  artifacts: VdArtifact[];
  scores: VdScore[];
}

// ============================================================================
// API TYPES
// ============================================================================

export interface TaskClaimRequest {
  workerId: string;
  limit: number;
}

export interface TaskClaimResponse {
  tasks: VdTaskQueueItem[];
}

export interface TaskReportRequest {
  taskId: string;
  status: "COMPLETED" | "FAILED";
  output?: Record<string, unknown>;
  error?: string;
}

export interface TaskReportResponse {
  success: boolean;
}

export interface DecisionProposeRequest {
  sprintId: string;
  type: VdDecisionTypeValue;
  agentRecommendation: {
    recommendation: string;
    rationale: string;
    alternatives?: Array<{
      option: string;
      pros: string[];
      cons: string[];
    }>;
    riskFlags?: string[];
    confidence?: number;
  };
  timeoutHours?: number;
}

export interface AnalyticsRecomputeRequest {
  sprintId?: string;
}

export interface AnalyticsRecomputeResponse {
  snapshotId: string;
}
