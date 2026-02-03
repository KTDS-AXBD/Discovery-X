/**
 * Venture 스코어링 정책
 *
 * - Depth Score: 근거·검증·리스크 대비·실행 명확성
 * - Effort Score: 사람+AI 투입 노력
 * - Next-ROI 추천: INVEST / EXPLORE / HOLD / DROP
 */

import type {
  VdRecommendationType,
  VdDepthScoreBreakdown,
  VdOpportunity,
  VdEvidence,
  VdAssumption,
  VdPremortem,
  VdArtifact,
  VdWorkEvent,
} from "../types";

// ============================================================================
// DEPTH SCORE (0-100)
// ============================================================================

export interface DepthScoreInput {
  evidences: VdEvidence[];
  assumptions: VdAssumption[];
  premortems: VdPremortem[];
  artifacts: VdArtifact[];
  opportunity: Partial<VdOpportunity>;
}

/**
 * Evidence Depth (0-40)
 * - 개수 (정규화): 0-20
 * - 출처 다양성 (도메인 수): 0-10
 * - 강도 분포 (A/B급 비율): 0-10
 */
function calculateEvidenceDepth(evidences: VdEvidence[]): number {
  if (evidences.length === 0) return 0;

  // 개수 점수 (최대 10개 기준)
  const countScore = Math.min(evidences.length / 10, 1) * 20;

  // 출처 다양성 (도메인 수)
  const domains = new Set(
    evidences
      .filter((e) => e.sourceUrl)
      .map((e) => {
        try {
          return new URL(e.sourceUrl!).hostname;
        } catch {
          return "unknown";
        }
      })
  );
  const diversityScore = Math.min(domains.size / 5, 1) * 10;

  // 강도 분포 (A/B급 비율)
  const strongEvidences = evidences.filter((e) => e.strength === "A" || e.strength === "B");
  const strengthScore = (strongEvidences.length / evidences.length) * 10;

  return Math.round(countScore + diversityScore + strengthScore);
}

/**
 * Assumption Coverage (0-25)
 * - 핵심 가정 5개 충족률: 0-15
 * - 검증 계획 유무: 0-5
 * - 검증 상태 (VALIDATED 비율): 0-5
 */
function calculateAssumptionCoverage(assumptions: VdAssumption[]): number {
  if (assumptions.length === 0) return 0;

  // 핵심 가정 충족률 (최대 5개 기준)
  const criticalAssumptions = assumptions.filter((a) => a.criticality && a.criticality >= 4);
  const coverageScore = Math.min(criticalAssumptions.length / 5, 1) * 15;

  // 검증 계획 유무
  const withPlan = assumptions.filter((a) => a.validationMethod && a.validationMethod.length > 0);
  const planScore = (withPlan.length / assumptions.length) * 5;

  // 검증 상태
  const validated = assumptions.filter((a) => a.status === "VALIDATED");
  const validatedScore = (validated.length / assumptions.length) * 5;

  return Math.round(coverageScore + planScore + validatedScore);
}

/**
 * Risk Readiness (0-15)
 * - Pre-mortem 5개 충족률: 0-8
 * - 완화책 존재/구체성: 0-7
 */
function calculateRiskReadiness(premortems: VdPremortem[]): number {
  if (premortems.length === 0) return 0;

  // Pre-mortem 개수 (최대 5개 기준)
  const countScore = Math.min(premortems.length / 5, 1) * 8;

  // 완화책 존재
  const withMitigation = premortems.filter(
    (p) => p.mitigationStrategy && p.mitigationStrategy.length > 20
  );
  const mitigationScore = (withMitigation.length / premortems.length) * 7;

  return Math.round(countScore + mitigationScore);
}

/**
 * Execution Clarity (0-20)
 * - 구매주체/예산 가설 명확성: 0-8
 * - 채널/접근 방법: 0-6
 * - 90일 실행 계획: 0-6
 */
function calculateExecutionClarity(
  opportunity: Partial<VdOpportunity>,
  artifacts: VdArtifact[]
): number {
  let score = 0;

  // Lean Canvas가 있으면 추가 점수
  const leanCanvas = artifacts.find((a) => a.artifactType === "LEAN_CANVAS");
  if (leanCanvas) {
    const content = leanCanvas.content as Record<string, unknown> | null;
    if (content) {
      // 구매주체/예산 (customer_segments, cost_structure)
      if (content.customer_segments) score += 4;
      if (content.cost_structure || content.revenue_streams) score += 4;
      // 채널 (channels)
      if (content.channels) score += 6;
    }
  }

  // targetSegment이 있으면 추가 점수
  if (opportunity.targetSegment && opportunity.targetSegment.length > 10) {
    score += 3;
  }

  // description이 충분히 상세하면 추가 점수
  if (opportunity.description && opportunity.description.length > 200) {
    score += 3;
  }

  return Math.min(Math.round(score), 20);
}

/**
 * 전체 Depth Score 계산
 */
export function calculateDepthScore(input: DepthScoreInput): VdDepthScoreBreakdown {
  const evidenceDepth = calculateEvidenceDepth(input.evidences);
  const assumptionCoverage = calculateAssumptionCoverage(input.assumptions);
  const riskReadiness = calculateRiskReadiness(input.premortems);
  const executionClarity = calculateExecutionClarity(input.opportunity, input.artifacts);

  return {
    evidenceDepth,
    assumptionCoverage,
    riskReadiness,
    executionClarity,
    total: evidenceDepth + assumptionCoverage + riskReadiness + executionClarity,
  };
}

// ============================================================================
// EFFORT SCORE
// ============================================================================

export interface EffortWeight {
  [eventType: string]: number;
}

export const HUMAN_EFFORT_WEIGHTS: EffortWeight = {
  signal_create: 1,
  evidence_add: 2,
  opportunity_update: 3,
  assumption_add: 3,
  assumption_update: 2,
  premortem_add: 2,
  lean_canvas_update: 8,
  artifact_create: 5,
  vote_submit: 1,
  comment_add: 1,
};

export const AGENT_EFFORT_WEIGHTS: EffortWeight = {
  signal_collect: 0.5,
  problem_analyze: 1,
  opportunity_generate: 2,
  theme_cluster: 1,
  score_compute: 0.5,
  deepdive_generate: 5,
  artifact_generate: 3,
  gate_prepare: 2,
};

export interface EffortScoreResult {
  humanEffort: number;
  agentEffort: number;
  total: number;
  ratio: { human: number; agent: number }; // 0-1
}

/**
 * Work Event 기반 Effort 계산
 */
export function calculateEffortScore(
  events: VdWorkEvent[],
  humanWeights: EffortWeight = HUMAN_EFFORT_WEIGHTS,
  agentWeights: EffortWeight = AGENT_EFFORT_WEIGHTS
): EffortScoreResult {
  let humanEffort = 0;
  let agentEffort = 0;

  for (const event of events) {
    const weight =
      event.actorType === "human"
        ? humanWeights[event.eventType] || 1
        : agentWeights[event.eventType] || 0.5;

    if (event.actorType === "human") {
      humanEffort += weight;
    } else {
      agentEffort += weight;
    }
  }

  const total = humanEffort + agentEffort;
  const ratio =
    total > 0
      ? { human: humanEffort / total, agent: agentEffort / total }
      : { human: 0, agent: 0 };

  return {
    humanEffort: Math.round(humanEffort * 10) / 10,
    agentEffort: Math.round(agentEffort * 10) / 10,
    total: Math.round(total * 10) / 10,
    ratio,
  };
}

// ============================================================================
// NEXT-ROI RECOMMENDATION
// ============================================================================

export interface NextRoiInput {
  potentialScore: number; // 0-100
  confidenceScore: number; // 0-100
  depthScore: number; // 0-100
  effortScore: number; // 0-100 (normalized)
  unknowns: number; // 미해결 가정/누락 필드 수
}

export interface NextRoiResult {
  recommendation: VdRecommendationType;
  rationale: string;
  scores: {
    potential: number;
    confidence: number;
    investmentValue: number; // (Potential * Confidence) / (Effort + 1)
    unknownPenalty: number;
  };
}

/**
 * Next-ROI 추천 계산
 *
 * - INVEST: Potential 높고, Unknowns가 해결 가능하며, Effort 대비 기대가 큼
 * - EXPLORE: Potential 중간, Effort 낮음 (아직 얕으니 조금 더 보자)
 * - HOLD: Potential은 있으나 Unknowns가 구조적
 * - DROP: Potential 낮고 Effort 높음 (이미 봤고 매력 낮음)
 */
export function calculateNextRoi(input: NextRoiInput): NextRoiResult {
  const { potentialScore, confidenceScore, depthScore, effortScore, unknowns } = input;

  // Investment Value = (Potential * Confidence) / (normalizedEffort + 10)
  // 10을 더해서 0으로 나누기 방지 + Effort가 낮을 때 너무 높은 값 방지
  const investmentValue = (potentialScore * confidenceScore) / (effortScore + 10);

  // Unknown Penalty (unknowns가 많을수록 페널티)
  const unknownPenalty = Math.min(unknowns * 5, 50); // 최대 50점 감점

  // Adjusted Investment Value
  const adjustedValue = investmentValue - unknownPenalty / 10;

  // 추천 결정
  let recommendation: VdRecommendationType;
  let rationale: string;

  if (potentialScore >= 70 && adjustedValue >= 30 && unknowns <= 5) {
    recommendation = "INVEST";
    rationale = "높은 잠재력과 양호한 신뢰도, 해결 가능한 미지 요소";
  } else if (potentialScore >= 50 && effortScore < 30 && depthScore < 40) {
    recommendation = "EXPLORE";
    rationale = "잠재력 있으나 탐색 깊이 부족, 추가 조사 권장";
  } else if (potentialScore >= 50 && unknowns > 5) {
    recommendation = "HOLD";
    rationale = "잠재력은 있으나 구조적 불확실성이 높음";
  } else {
    recommendation = "DROP";
    rationale = "낮은 잠재력 또는 높은 투입 대비 기대 효과 미흡";
  }

  return {
    recommendation,
    rationale,
    scores: {
      potential: potentialScore,
      confidence: confidenceScore,
      investmentValue: Math.round(investmentValue * 10) / 10,
      unknownPenalty,
    },
  };
}

// ============================================================================
// OPPORTUNITY RANKING
// ============================================================================

export interface RankingInput {
  opportunities: Array<{
    id: string;
    potentialScore: number | null;
    confidenceScore: number | null;
    depthScore: number | null;
    effortScore: number | null;
  }>;
  weights?: {
    potential: number;
    confidence: number;
    depth: number;
    effort: number; // negative weight (lower effort = better)
  };
}

export interface RankedOpportunity {
  id: string;
  compositeScore: number;
  rank: number;
}

/**
 * 기회 순위 계산
 */
export function rankOpportunities(input: RankingInput): RankedOpportunity[] {
  const { opportunities, weights = { potential: 0.4, confidence: 0.3, depth: 0.2, effort: -0.1 } } =
    input;

  const scored = opportunities.map((opp) => {
    const compositeScore =
      (opp.potentialScore || 0) * weights.potential +
      (opp.confidenceScore || 0) * weights.confidence +
      (opp.depthScore || 0) * weights.depth +
      (100 - (opp.effortScore || 0)) * Math.abs(weights.effort); // effort는 낮을수록 좋음

    return {
      id: opp.id,
      compositeScore: Math.round(compositeScore * 10) / 10,
      rank: 0,
    };
  });

  // 점수 기준 내림차순 정렬
  scored.sort((a, b) => b.compositeScore - a.compositeScore);

  // 순위 부여
  return scored.map((item, index) => ({
    ...item,
    rank: index + 1,
  }));
}
