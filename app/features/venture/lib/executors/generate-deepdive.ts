/**
 * GENERATE_DEEPDIVE Executor
 *
 * 기회에 대한 Deep Dive 분석 (Assumption, Pre-mortem, Lean Canvas)을 생성합니다.
 */

import type { ExecutorContext } from "../executor/task-executor";
import {
  getOpportunityById,
  listOpportunitiesBySprint,
  createAssumption,
  createPremortem,
  createArtifact,
} from "../../repositories/opportunity.repository";
import { generateJson } from "../ai/openai-client";
import { GENERATE_DEEPDIVE_SYSTEM, GENERATE_DEEPDIVE_USER } from "../ai/prompts";

// ============================================================================
// TYPES
// ============================================================================

export interface GenerateDeepDiveInput {
  sprintId: string;
  opportunityIds: string[];
}

export interface GenerateDeepDiveOutput {
  results: Array<{
    opportunityId: string;
    assumptionIds: string[];
    premortemIds: string[];
    leanCanvasId: string | null;
  }>;
}

interface GeneratedAssumption {
  statement: string;
  criticality: number;
  validationMethod: string;
}

interface GeneratedPremortem {
  failureScenario: string;
  probability: number;
  impact: number;
  mitigationStrategy: string;
}

interface LeanCanvasContent {
  problem: string[];
  solution: string[];
  unique_value_proposition: string;
  unfair_advantage: string;
  customer_segments: string[];
  key_metrics: string[];
  channels: string[];
  cost_structure: string[];
  revenue_streams: string[];
}

interface DeepDiveResponse {
  assumptions: GeneratedAssumption[];
  premortems: GeneratedPremortem[];
  leanCanvas: LeanCanvasContent;
}

// ============================================================================
// EXECUTOR
// ============================================================================

export async function executeGenerateDeepDive(
  ctx: ExecutorContext,
  input: GenerateDeepDiveInput
): Promise<GenerateDeepDiveOutput> {
  const { db, openaiApiKey, sprintId } = ctx;
  let opportunityIds = input.opportunityIds;

  // opportunityIds가 비어있으면 shortlisted 기회만 대상
  if (!opportunityIds || opportunityIds.length === 0) {
    const shortlisted = await listOpportunitiesBySprint(db, sprintId, { shortlistedOnly: true });
    opportunityIds = shortlisted.map((o) => o.id);
  }

  if (opportunityIds.length === 0) {
    return { results: [] };
  }

  const results: GenerateDeepDiveOutput["results"] = [];

  for (const opportunityId of opportunityIds) {
    const opportunity = await getOpportunityById(db, opportunityId);
    if (!opportunity) {
      continue;
    }

    // AI Deep Dive 생성
    const response = await generateJson<DeepDiveResponse>(
      openaiApiKey,
      GENERATE_DEEPDIVE_SYSTEM,
      GENERATE_DEEPDIVE_USER({
        title: opportunity.title,
        description: opportunity.description,
        targetSegment: opportunity.targetSegment,
      }),
      { temperature: 0.6, maxTokens: 8192 }
    );

    const assumptionIds: string[] = [];
    const premortemIds: string[] = [];
    let leanCanvasId: string | null = null;

    // Assumption 생성
    for (const assumption of response.assumptions) {
      if (!assumption.statement || assumption.statement.length < 10) {
        continue;
      }

      const created = await createAssumption(db, opportunityId, {
        statement: assumption.statement,
        criticality: Math.min(Math.max(assumption.criticality || 3, 1), 5),
        validationMethod: assumption.validationMethod ?? undefined,
        confidence: undefined,
        evidenceIds: undefined,
      });

      assumptionIds.push(created.id);
    }

    // Pre-mortem 생성
    for (const premortem of response.premortems) {
      if (!premortem.failureScenario || premortem.failureScenario.length < 10) {
        continue;
      }

      const created = await createPremortem(db, opportunityId, {
        failureScenario: premortem.failureScenario,
        probability: Math.min(Math.max(premortem.probability || 50, 0), 100),
        impact: Math.min(Math.max(premortem.impact || 3, 1), 5),
        mitigationStrategy: premortem.mitigationStrategy ?? undefined,
      });

      premortemIds.push(created.id);
    }

    // Lean Canvas 생성
    if (response.leanCanvas) {
      const artifact = await createArtifact(db, opportunityId, {
        artifactType: "LEAN_CANVAS",
        title: `${opportunity.title} - Lean Canvas`,
        content: response.leanCanvas as unknown as Record<string, unknown>,
      });

      leanCanvasId = artifact.id;
    }

    results.push({
      opportunityId,
      assumptionIds,
      premortemIds,
      leanCanvasId,
    });
  }

  return { results };
}
