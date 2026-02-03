/**
 * GENERATE_ARTIFACTS Executor
 *
 * 피치 덱, 1-pager 등 산출물을 생성합니다.
 */

import type { ExecutorContext } from "../executor/task-executor";
import {
  getOpportunityById,
  listOpportunitiesBySprint,
  createArtifact,
} from "../../repositories/opportunity.repository";
import { generateJson } from "../ai/openai-client";
import {
  GENERATE_PITCH_DECK_SYSTEM,
  GENERATE_ONE_PAGER_SYSTEM,
  GENERATE_ARTIFACTS_USER,
} from "../ai/prompts";
import type { VdArtifactTypeValue } from "../../types";

// ============================================================================
// TYPES
// ============================================================================

export interface GenerateArtifactsInput {
  sprintId: string;
  opportunityIds: string[];
  artifactTypes: string[];
}

export interface GenerateArtifactsOutput {
  artifacts: Array<{
    opportunityId: string;
    artifactId: string;
    artifactType: string;
  }>;
}

interface PitchDeckSlide {
  title: string;
  content: string;
  speakerNotes: string;
}

interface PitchDeckResponse {
  slides: PitchDeckSlide[];
}

interface OnePagerSection {
  heading: string;
  content: string;
}

interface OnePagerResponse {
  title: string;
  summary: string;
  sections: OnePagerSection[];
}

// ============================================================================
// EXECUTOR
// ============================================================================

export async function executeGenerateArtifacts(
  ctx: ExecutorContext,
  input: GenerateArtifactsInput
): Promise<GenerateArtifactsOutput> {
  const { db, openaiApiKey, sprintId } = ctx;
  let opportunityIds = input.opportunityIds;
  const artifactTypes = input.artifactTypes || ["PITCH_DECK", "ONE_PAGER"];

  // opportunityIds가 비어있으면 final 기회만 대상
  if (!opportunityIds || opportunityIds.length === 0) {
    const finalOpportunities = await listOpportunitiesBySprint(db, sprintId, { finalOnly: true });
    opportunityIds = finalOpportunities.map((o) => o.id);
  }

  if (opportunityIds.length === 0) {
    return { artifacts: [] };
  }

  const artifacts: GenerateArtifactsOutput["artifacts"] = [];

  for (const opportunityId of opportunityIds) {
    const opportunity = await getOpportunityById(db, opportunityId);
    if (!opportunity) {
      continue;
    }

    for (const artifactType of artifactTypes) {
      const normalizedType = artifactType.toUpperCase() as VdArtifactTypeValue;

      // 지원하는 타입만 처리
      if (!["PITCH_DECK", "ONE_PAGER", "EXECUTIVE_SUMMARY"].includes(normalizedType)) {
        continue;
      }

      let content: Record<string, unknown>;
      let title: string;

      if (normalizedType === "PITCH_DECK") {
        // 피치 덱 생성
        const response = await generateJson<PitchDeckResponse>(
          openaiApiKey,
          GENERATE_PITCH_DECK_SYSTEM,
          GENERATE_ARTIFACTS_USER(
            {
              title: opportunity.title,
              description: opportunity.description,
              targetSegment: opportunity.targetSegment,
            },
            normalizedType
          ),
          { temperature: 0.7, maxTokens: 8192 }
        );

        content = { slides: response.slides };
        title = `${opportunity.title} - Pitch Deck`;
      } else if (normalizedType === "ONE_PAGER" || normalizedType === "EXECUTIVE_SUMMARY") {
        // 1-pager / 요약 생성
        const response = await generateJson<OnePagerResponse>(
          openaiApiKey,
          GENERATE_ONE_PAGER_SYSTEM,
          GENERATE_ARTIFACTS_USER(
            {
              title: opportunity.title,
              description: opportunity.description,
              targetSegment: opportunity.targetSegment,
            },
            normalizedType
          ),
          { temperature: 0.7, maxTokens: 4096 }
        );

        content = {
          title: response.title,
          summary: response.summary,
          sections: response.sections,
        };
        title = `${opportunity.title} - ${normalizedType === "ONE_PAGER" ? "1-Pager" : "Executive Summary"}`;
      } else {
        continue;
      }

      // 아티팩트 생성
      const artifact = await createArtifact(db, opportunityId, {
        artifactType: normalizedType,
        title,
        content,
      });

      artifacts.push({
        opportunityId,
        artifactId: artifact.id,
        artifactType: normalizedType,
      });
    }
  }

  return { artifacts };
}
