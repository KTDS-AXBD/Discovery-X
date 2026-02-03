/**
 * PREPARE_GATE Executor
 *
 * Gate 의사결정을 위한 자료 준비:
 * - 랭킹 계산
 * - Decision 생성
 * - Shortlist 후보 선정
 */

import type { ExecutorContext } from "../executor/task-executor";
import { listOpportunitiesBySprint, updateOpportunity } from "../../repositories/opportunity.repository";
import { createDecision } from "../../repositories/decision.repository";
import { getSprintById } from "../../repositories/sprint.repository";
import { rankOpportunities, type RankedOpportunity } from "../../domain/scoring-policy";
import type { VdDecisionTypeValue } from "../../types";

// ============================================================================
// TYPES
// ============================================================================

export interface PrepareGateInput {
  sprintId: string;
  gateType: "GATE1" | "GATE2";
}

export interface PrepareGateOutput {
  decisionId: string;
  rankedOpportunities: RankedOpportunity[];
  shortlistIds: string[];
}

// ============================================================================
// EXECUTOR
// ============================================================================

export async function executePrepareGate(
  ctx: ExecutorContext,
  input: PrepareGateInput
): Promise<PrepareGateOutput> {
  const { db, sprintId } = ctx;
  const { gateType } = input;

  // 스프린트 조회
  const sprint = await getSprintById(db, sprintId);
  if (!sprint) {
    throw new Error(`Sprint not found: ${sprintId}`);
  }

  // Gate 타입에 따른 설정
  const decisionType: VdDecisionTypeValue = gateType === "GATE1" ? "GATE1_SHORTLIST" : "GATE2_FINAL";
  const config = sprint.config || {};
  const shortlistSize = gateType === "GATE1" ? (config.shortlistSize || 5) : (config.finalSize || 3);

  // 기회 목록 조회
  const filter = gateType === "GATE2" ? { shortlistedOnly: true } : undefined;
  const opportunities = await listOpportunitiesBySprint(db, sprintId, filter);

  if (opportunities.length === 0) {
    throw new Error(`No opportunities found for ${gateType}`);
  }

  // 랭킹 계산
  const rankingInput = {
    opportunities: opportunities.map((o) => ({
      id: o.id,
      potentialScore: o.potentialScore,
      confidenceScore: o.confidenceScore,
      depthScore: o.depthScore,
      effortScore: o.effortScore,
    })),
  };

  const rankedOpportunities = rankOpportunities(rankingInput);

  // 순위 DB 업데이트
  for (const ranked of rankedOpportunities) {
    await updateOpportunity(db, ranked.id, { rank: ranked.rank });
  }

  // Shortlist 후보 선정 (상위 N개)
  const shortlistIds = rankedOpportunities.slice(0, shortlistSize).map((r) => r.id);

  // Agent 추천 생성
  const topOpportunities = rankedOpportunities.slice(0, shortlistSize);
  const recommendation = {
    recommendation: `상위 ${shortlistSize}개 기회를 ${gateType === "GATE1" ? "Shortlist" : "최종 선정"}으로 추천합니다`,
    rationale: buildRationale(opportunities, topOpportunities),
    alternatives: buildAlternatives(opportunities, rankedOpportunities, shortlistSize),
    riskFlags: identifyRisks(opportunities, topOpportunities),
    confidence: calculateConfidence(topOpportunities),
  };

  // Decision 생성
  const decision = await createDecision(db, sprintId, {
    decisionType,
    agentRecommendation: recommendation,
    timeoutAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24시간 후
  });

  return {
    decisionId: decision.id,
    rankedOpportunities,
    shortlistIds,
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function buildRationale(
  opportunities: Array<{ id: string; title: string; depthScore: number | null; recommendation: string | null }>,
  topOpportunities: RankedOpportunity[]
): string {
  const topIds = new Set(topOpportunities.map((t) => t.id));
  const topOps = opportunities.filter((o) => topIds.has(o.id));

  const investCount = topOps.filter((o) => o.recommendation === "INVEST").length;
  const exploreCount = topOps.filter((o) => o.recommendation === "EXPLORE").length;
  const avgDepth = Math.round(
    topOps.reduce((sum, o) => sum + (o.depthScore || 0), 0) / topOps.length
  );

  return `추천 기회 중 ${investCount}개는 INVEST, ${exploreCount}개는 EXPLORE 등급입니다. 평균 Depth Score는 ${avgDepth}점입니다.`;
}

function buildAlternatives(
  opportunities: Array<{ id: string; title: string }>,
  rankedOpportunities: RankedOpportunity[],
  shortlistSize: number
): Array<{ option: string; pros: string[]; cons: string[] }> {
  // 차점자들을 대안으로 제시
  const alternatives = rankedOpportunities.slice(shortlistSize, shortlistSize + 2);

  return alternatives.map((alt) => {
    const opp = opportunities.find((o) => o.id === alt.id);
    return {
      option: opp?.title || alt.id,
      pros: [`종합 점수 ${alt.compositeScore}점으로 경쟁력 있음`],
      cons: [`현재 순위 ${alt.rank}위로 상위권 진입 실패`],
    };
  });
}

function identifyRisks(
  opportunities: Array<{ id: string; depthScore: number | null; recommendation: string | null }>,
  topOpportunities: RankedOpportunity[]
): string[] {
  const risks: string[] = [];
  const topIds = new Set(topOpportunities.map((t) => t.id));

  // 낮은 Depth Score 경고
  const lowDepth = opportunities.filter(
    (o) => topIds.has(o.id) && (o.depthScore ?? 0) < 40
  );
  if (lowDepth.length > 0) {
    risks.push(`${lowDepth.length}개 기회의 Depth Score가 40점 미만입니다`);
  }

  // HOLD/DROP 등급 포함 경고
  const holdOrDrop = opportunities.filter(
    (o) => topIds.has(o.id) && (o.recommendation === "HOLD" || o.recommendation === "DROP")
  );
  if (holdOrDrop.length > 0) {
    risks.push(`${holdOrDrop.length}개 기회가 HOLD/DROP 등급입니다`);
  }

  return risks;
}

function calculateConfidence(topOpportunities: RankedOpportunity[]): number {
  if (topOpportunities.length === 0) return 50;

  // 점수 분포가 명확할수록 confidence 높음
  const scores = topOpportunities.map((t) => t.compositeScore);
  const maxScore = Math.max(...scores);
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;

  // 최고 점수와 평균의 차이가 클수록 명확한 1등
  const spread = maxScore - avgScore;
  return Math.min(Math.round(50 + spread), 95);
}
