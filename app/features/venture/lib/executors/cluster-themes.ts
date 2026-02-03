/**
 * CLUSTER_THEMES Executor
 *
 * 기회(Opportunity)들을 AI를 활용하여 테마별로 클러스터링합니다.
 */

import type { ExecutorContext } from "../executor/task-executor";
import { listOpportunitiesBySprint, updateOpportunity } from "../../repositories/opportunity.repository";
import { createTheme, updateTheme } from "../../repositories/signal.repository";
import { generateJson } from "../ai/openai-client";
import { CLUSTER_THEMES_SYSTEM, CLUSTER_THEMES_USER } from "../ai/prompts";

// ============================================================================
// TYPES
// ============================================================================

export interface ClusterThemesInput {
  sprintId: string;
  opportunityIds: string[];
}

export interface ClusterThemesOutput {
  themeIds: string[];
  assignments: Array<{
    opportunityId: string;
    themeId: string;
  }>;
}

interface GeneratedTheme {
  name: string;
  description: string;
  opportunityIds: string[];
}

interface ClusterThemesResponse {
  themes: GeneratedTheme[];
}

// ============================================================================
// EXECUTOR
// ============================================================================

export async function executeClusterThemes(
  ctx: ExecutorContext,
  input: ClusterThemesInput
): Promise<ClusterThemesOutput> {
  const { db, openaiApiKey, sprintId } = ctx;
  let opportunityIds = input.opportunityIds;

  // opportunityIds가 비어있으면 스프린트의 모든 기회 대상
  if (!opportunityIds || opportunityIds.length === 0) {
    const allOpportunities = await listOpportunitiesBySprint(db, sprintId);
    opportunityIds = allOpportunities.map((o) => o.id);
  }

  if (opportunityIds.length === 0) {
    return { themeIds: [], assignments: [] };
  }

  // 기회 데이터 조회
  const opportunities = await listOpportunitiesBySprint(db, sprintId);
  const targetOpportunities = opportunities.filter((o) => opportunityIds.includes(o.id));

  if (targetOpportunities.length === 0) {
    return { themeIds: [], assignments: [] };
  }

  // AI 클러스터링
  const response = await generateJson<ClusterThemesResponse>(
    openaiApiKey,
    CLUSTER_THEMES_SYSTEM,
    CLUSTER_THEMES_USER(
      targetOpportunities.map((o) => ({
        id: o.id,
        title: o.title,
        description: o.description,
      }))
    ),
    { temperature: 0.5, maxTokens: 4096 }
  );

  const themeIds: string[] = [];
  const assignments: ClusterThemesOutput["assignments"] = [];

  // 테마 생성 및 기회 할당
  for (const generatedTheme of response.themes) {
    // 유효성 검사
    if (!generatedTheme.name || generatedTheme.name.length < 2) {
      continue;
    }

    // 테마 생성
    const theme = await createTheme(db, sprintId, {
      name: generatedTheme.name,
      description: generatedTheme.description || undefined,
      metadata: {
        generatedBy: "agent",
      },
    });

    themeIds.push(theme.id);

    // 유효한 opportunityIds만 필터링
    const validOpportunityIds = generatedTheme.opportunityIds.filter((id) =>
      opportunityIds.includes(id)
    );

    // 기회에 테마 할당
    for (const oppId of validOpportunityIds) {
      await updateOpportunity(db, oppId, { themeId: theme.id });
      assignments.push({
        opportunityId: oppId,
        themeId: theme.id,
      });
    }

    // 테마의 기회 수 업데이트
    await updateTheme(db, theme.id, {
      opportunityCount: validOpportunityIds.length,
    });
  }

  return {
    themeIds,
    assignments,
  };
}
