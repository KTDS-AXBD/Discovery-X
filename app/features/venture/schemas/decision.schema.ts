/**
 * Venture Decision Zod 스키마
 */

import { z } from "zod";
import { VD_DECISION_TYPES, VD_DECISION_STATUSES } from "../constants/decision-types";

// ============================================================================
// BASE SCHEMAS
// ============================================================================

export const vdDecisionTypeSchema = z.enum(VD_DECISION_TYPES);
export const vdDecisionStatusSchema = z.enum(VD_DECISION_STATUSES);

// ============================================================================
// AGENT RECOMMENDATION
// ============================================================================

export const agentAlternativeSchema = z.object({
  option: z.string(),
  pros: z.array(z.string()),
  cons: z.array(z.string()),
});

export const agentRecommendationSchema = z.object({
  recommendation: z.string().min(1, "추천안은 필수입니다"),
  rationale: z.string().min(1, "근거는 필수입니다"),
  alternatives: z.array(agentAlternativeSchema).optional(),
  riskFlags: z.array(z.string()).optional(),
  confidence: z.number().int().min(0).max(100).optional(),
});

export type AgentRecommendation = z.infer<typeof agentRecommendationSchema>;

// ============================================================================
// CREATE DECISION
// ============================================================================

export const createDecisionSchema = z.object({
  decisionType: vdDecisionTypeSchema,
  agentRecommendation: agentRecommendationSchema.optional(),
  timeoutAt: z.coerce.date().optional(),
});

export type CreateDecisionInput = z.infer<typeof createDecisionSchema>;

// ============================================================================
// SUBMIT DECISION
// ============================================================================

export const submitDecisionSchema = z.object({
  selectedOption: z.string().min(1, "선택 옵션은 필수입니다"),
  humanRationale: z.string().max(2000).optional(),
});

export type SubmitDecisionInput = z.infer<typeof submitDecisionSchema>;

// ============================================================================
// VOTE
// ============================================================================

export const createVoteSchema = z.object({
  decisionId: z.string().min(1),
  opportunityId: z.string().optional(),
  vote: z.number().int(), // 점수 또는 순위
  comment: z.string().max(1000).optional(),
  isBlind: z.boolean().default(true),
});

export type CreateVoteInput = z.infer<typeof createVoteSchema>;

export const updateVoteSchema = z.object({
  vote: z.number().int().optional(),
  comment: z.string().max(1000).optional(),
});

export type UpdateVoteInput = z.infer<typeof updateVoteSchema>;

// ============================================================================
// DECISION PROPOSAL (from Agent)
// ============================================================================

export const proposeDecisionSchema = z.object({
  sprintId: z.string().min(1),
  type: vdDecisionTypeSchema,
  agentRecommendation: agentRecommendationSchema,
  timeoutHours: z.number().positive().default(48),
});

export type ProposeDecisionInput = z.infer<typeof proposeDecisionSchema>;

// ============================================================================
// VOTE AGGREGATION
// ============================================================================

export interface VoteAggregation {
  decisionId: string;
  totalVoters: number;
  averageScore: number;
  scoreDistribution: Record<number, number>; // score -> count
  opportunityScores?: Array<{
    opportunityId: string;
    averageScore: number;
    voteCount: number;
    rank: number;
  }>;
  hasConsensus: boolean;
  consensusThreshold: number;
}

/**
 * 투표 결과 집계
 */
export function aggregateVotes(
  votes: Array<{
    opportunityId: string | null;
    vote: number;
  }>,
  consensusThreshold: number = 0.7
): Partial<VoteAggregation> {
  if (votes.length === 0) {
    return {
      totalVoters: 0,
      averageScore: 0,
      scoreDistribution: {},
      hasConsensus: false,
      consensusThreshold,
    };
  }

  const totalVoters = votes.length;
  const totalScore = votes.reduce((sum, v) => sum + v.vote, 0);
  const averageScore = totalScore / totalVoters;

  // Score distribution
  const scoreDistribution: Record<number, number> = {};
  for (const v of votes) {
    scoreDistribution[v.vote] = (scoreDistribution[v.vote] || 0) + 1;
  }

  // Check consensus (e.g., 70% 이상 같은 점수)
  const maxScoreCount = Math.max(...Object.values(scoreDistribution));
  const hasConsensus = maxScoreCount / totalVoters >= consensusThreshold;

  // Opportunity-level scores (for shortlist/final selection)
  const opportunityVotes = new Map<string, number[]>();
  for (const v of votes) {
    if (v.opportunityId) {
      const existing = opportunityVotes.get(v.opportunityId) || [];
      existing.push(v.vote);
      opportunityVotes.set(v.opportunityId, existing);
    }
  }

  const opportunityScores = Array.from(opportunityVotes.entries())
    .map(([opportunityId, scores]) => ({
      opportunityId,
      averageScore: scores.reduce((a, b) => a + b, 0) / scores.length,
      voteCount: scores.length,
      rank: 0, // Will be set after sorting
    }))
    .sort((a, b) => b.averageScore - a.averageScore)
    .map((item, index) => ({ ...item, rank: index + 1 }));

  return {
    totalVoters,
    averageScore,
    scoreDistribution,
    opportunityScores: opportunityScores.length > 0 ? opportunityScores : undefined,
    hasConsensus,
    consensusThreshold,
  };
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * 결정 제출 가능 여부 검증
 */
export function canSubmitDecision(
  votes: Array<{ voterId: string }>,
  requirements: {
    minVoters: number;
    requireReviewer: boolean;
  },
  reviewerIds: string[] = []
): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const voterIds = votes.map((v) => v.voterId);

  if (voterIds.length < requirements.minVoters) {
    errors.push(
      `최소 ${requirements.minVoters}명의 투표가 필요합니다 (현재: ${voterIds.length}명)`
    );
  }

  if (requirements.requireReviewer) {
    const hasReviewerVote = reviewerIds.some((rid) => voterIds.includes(rid));
    if (!hasReviewerVote) {
      errors.push("리뷰어의 투표가 필요합니다");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
