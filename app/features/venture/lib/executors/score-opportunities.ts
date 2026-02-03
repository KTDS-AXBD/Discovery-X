/**
 * SCORE_OPPORTUNITIES Executor
 *
 * 기존 scoring-policy.ts를 재사용하여 기회 카드에 점수 부여
 */

import type { ExecutorContext } from "../executor/task-executor";
import { getOpportunityFull, updateOpportunity, createScore } from "../../repositories/opportunity.repository";
import { listOpportunitiesBySprint } from "../../repositories/opportunity.repository";
import { calculateDepthScore, calculateEffortScore, calculateNextRoi, type DepthScoreInput } from "../../domain/scoring-policy";
import { vdWorkEvents } from "../../db/schema";
import { eq } from "drizzle-orm";

// ============================================================================
// TYPES
// ============================================================================

export interface ScoreOpportunitiesInput {
  sprintId: string;
  opportunityIds: string[];
  presetId?: string;
}

export interface ScoreOpportunitiesOutput {
  scores: Array<{
    opportunityId: string;
    depthScore: number;
    potentialScore: number;
    confidenceScore: number;
    effortScore: number;
    recommendation: string;
  }>;
}

// ============================================================================
// EXECUTOR
// ============================================================================

export async function executeScoreOpportunities(
  ctx: ExecutorContext,
  input: ScoreOpportunitiesInput
): Promise<ScoreOpportunitiesOutput> {
  const { db, sprintId } = ctx;
  const opportunityIds = input.opportunityIds;

  // opportunityIds가 비어있으면 스프린트의 모든 기회 대상
  let targetIds = opportunityIds;
  if (!targetIds || targetIds.length === 0) {
    const allOpportunities = await listOpportunitiesBySprint(db, sprintId);
    targetIds = allOpportunities.map((o) => o.id);
  }

  const results: ScoreOpportunitiesOutput["scores"] = [];

  for (const opportunityId of targetIds) {
    // 기회 전체 정보 조회
    const opportunityFull = await getOpportunityFull(db, opportunityId);
    if (!opportunityFull) {
      console.warn(`Opportunity not found: ${opportunityId}`);
      continue;
    }

    // 1. Depth Score 계산
    const depthInput: DepthScoreInput = {
      evidences: opportunityFull.evidences,
      assumptions: opportunityFull.assumptions,
      premortems: opportunityFull.premortems,
      artifacts: opportunityFull.artifacts,
      opportunity: opportunityFull,
    };
    const depthBreakdown = calculateDepthScore(depthInput);

    // 2. Effort Score 계산 (WorkEvent 기반)
    const workEvents = await db
      .select()
      .from(vdWorkEvents)
      .where(eq(vdWorkEvents.entityId, opportunityId));

    const effortResult = calculateEffortScore(workEvents);
    const normalizedEffort = Math.min(Math.round(effortResult.total), 100);

    // 3. Potential/Confidence는 기존 값 사용 또는 기본값
    const potentialScore = opportunityFull.potentialScore ?? 50;
    const confidenceScore = opportunityFull.confidenceScore ?? 50;

    // 4. Next-ROI 계산
    const unknowns = opportunityFull.assumptions.filter((a) => a.status === "OPEN").length;
    const nextRoi = calculateNextRoi({
      potentialScore,
      confidenceScore,
      depthScore: depthBreakdown.total,
      effortScore: normalizedEffort,
      unknowns,
    });

    // 5. DB 업데이트
    await updateOpportunity(db, opportunityId, {
      depthScore: depthBreakdown.total,
      effortScore: normalizedEffort,
      recommendation: nextRoi.recommendation,
    });

    // 6. Score 레코드 생성 (이력 관리)
    await createScore(db, opportunityId, {
      dimension: "depth",
      value: depthBreakdown.total,
      source: "agent",
      metadata: { breakdown: depthBreakdown },
    });

    await createScore(db, opportunityId, {
      dimension: "effort",
      value: normalizedEffort,
      source: "agent",
      metadata: { humanRatio: effortResult.ratio.human, agentRatio: effortResult.ratio.agent },
    });

    results.push({
      opportunityId,
      depthScore: depthBreakdown.total,
      potentialScore,
      confidenceScore,
      effortScore: normalizedEffort,
      recommendation: nextRoi.recommendation,
    });
  }

  return { scores: results };
}
