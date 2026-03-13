// ============================================================================
// PRD STUDIO TYPES — JSON 컬럼 타입 + 서비스 입출력
// ============================================================================

import type { InferSelectModel } from "drizzle-orm";
import type { prds, prdSections, prdReviews, prdAnalysisQueue } from "../db/schema";

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
}
