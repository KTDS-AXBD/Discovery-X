// ============================================================================
// PRD STUDIO TYPES — JSON 컬럼 타입 + 서비스 입출력
// ============================================================================

import type { InferSelectModel } from "drizzle-orm";
import type { prds, prdSections, prdReviews, prdAnalysisQueue, prdStrategyQueue } from "../db/schema";

// ----------------------------------------------------------------------------
// DB Row Types (InferSelectModel)
// ----------------------------------------------------------------------------

export type Prd = InferSelectModel<typeof prds>;
export type PrdSection = InferSelectModel<typeof prdSections>;
export type PrdReview = InferSelectModel<typeof prdReviews>;
export type PrdAnalysisQueueItem = InferSelectModel<typeof prdAnalysisQueue>;

// ----------------------------------------------------------------------------
// JSON Column Types
// ----------------------------------------------------------------------------

/** prd_versions.snapshot — 특정 시점의 PRD 전체 스냅샷 */
export interface PrdVersionSnapshot {
  title: string;
  sections: Array<{
    type: string;
    content: string;
  }>;
  metadata?: Record<string, unknown>;
}

/** prd_reviews.feedbackItems — AI 검토 피드백 항목 */
export interface ReviewFeedbackItem {
  section?: string;
  severity: "critical" | "major" | "minor" | "suggestion";
  message: string;
  suggestion?: string;
}

/** prd_reviews.scorecard — AI 검토 점수표 */
export interface ReviewScorecard {
  totalScore: number;
  items: Array<{
    criteria: string;
    score: number;
    maxScore: number;
    comment?: string;
  }>;
}

// ----------------------------------------------------------------------------
// Service Input/Output Types
// ----------------------------------------------------------------------------

export interface CreatePrdInput {
  tenantId: string;
  title: string;
  createdBy: string;
  sourceIdeaId?: string;
}

export interface UpdatePrdInput {
  title?: string;
  status?: string;
  interviewProgress?: number;
  finalRating?: number;
  finalComment?: string;
  // F50: Ambiguity Score
  ambiguityScore?: number;
  dimensionScores?: DimensionScoresJson;
  projectType?: string;
}

// ----------------------------------------------------------------------------
// F50: Ambiguity Score Types
// ----------------------------------------------------------------------------

/** 평가 차원 */
export type DimensionType = "goal" | "constraint" | "success" | "context";

/** 프로젝트 유형 */
export type ProjectType = "greenfield" | "brownfield";

/** 게이트 상태 */
export type GateStatus = "pass" | "warn" | "block";

/** 차원별 평가 결과 */
export interface DimensionScore {
  dimension: DimensionType;
  score: number;
  rationale: string;
  weakPoints: string[];
  suggestedQuestions: string[];
}

/** 최종 평가 결과 */
export interface AmbiguityResult {
  ambiguityScore: number;
  clarityPercent: number;
  projectType: ProjectType;
  dimensions: DimensionScore[];
  gateStatus: GateStatus;
  evaluatedAt: number;
  model: string;
}

/** AmbiguityScorer 설정 */
export interface AmbiguityConfig {
  gateThreshold: number;
  warnThreshold: number;
  temperature: number;
  maxTokens: number;
  model: string;
}

/** DB에 저장되는 dimension_scores JSON 구조 */
export interface DimensionScoresJson {
  goal: DimensionScoreEntry | null;
  constraint: DimensionScoreEntry | null;
  success: DimensionScoreEntry | null;
  context: DimensionScoreEntry | null;
  evaluatedAt: number;
  model: string;
  projectType: ProjectType;
}

/** dimension_scores 내 개별 차원 */
export interface DimensionScoreEntry {
  score: number;
  rationale: string;
  weakPoints: string[];
  suggestedQuestions: string[];
}

// ----------------------------------------------------------------------------
// Strategy Analysis Types (Phase 4)
// ----------------------------------------------------------------------------

export type PrdStrategyQueueItem = InferSelectModel<typeof prdStrategyQueue>;

/** result_strategy — 6개 전략 프레임워크 결과 */
export interface StrategyResult {
  swot: {
    strengths: string[];
    weaknesses: string[];
    opportunities: string[];
    threats: string[];
    crossAnalysis: string;
  };
  leanCanvas: {
    problem: string;
    solution: string;
    keyMetrics: string;
    uniqueValueProp: string;
    unfairAdvantage: string;
    channels: string;
    customerSegments: string;
    costStructure: string;
    revenueStreams: string;
  };
  jtbd: {
    who: string;
    why: string;
    whatBefore: string;
    how: string;
    whatAfter: string;
    alternatives: string;
  };
  competition: {
    directCompetitors: Array<{
      name: string;
      description: string;
      strengths: string | string[];
      weaknesses: string | string[];
    }>;
    indirectCompetitors: Array<{
      name: string;
      description: string;
    }>;
    differentiation: string;
  };
  marketSizing: {
    tam: { value: string; description: string };
    sam: { value: string; description: string };
    som: { value: string; description: string };
    methodology: string;
    assumptions: string[];
  };
  riskAssessment: {
    risks: Array<{
      category: string;
      description: string;
      impact: "high" | "medium" | "low";
      likelihood: "high" | "medium" | "low";
      mitigation: string;
    }>;
    overallRiskLevel: "high" | "medium" | "low";
    summary: string;
  };
}

/** result_gtm — GTM 전략 결과 */
export interface GtmResult {
  beachheadSegment: {
    segment: string;
    rationale: string;
    size: string;
    accessibility: string;
  };
  icp: {
    profile: string;
    demographics: string;
    psychographics: string;
    painPoints: string[];
    buyingTriggers: string[];
  };
  messaging: {
    oneLiner: string;
    elevatorPitch: string;
    keyMessages: string[];
  };
  channelStrategy: {
    channels: Array<{
      name: string;
      priority: "primary" | "secondary" | "experimental";
      rationale: string;
      estimatedCost: string;
    }>;
    recommendation: string;
  };
  launchPlan: {
    phases: Array<{
      name: string;
      duration: string;
      objectives: string[];
      actions: string[];
    }>;
  };
}
