/**
 * GENERATE_OPPORTUNITIES Executor
 *
 * 문제(Problem)들을 기반으로 AI를 활용하여 비즈니스 기회 카드를 생성합니다.
 */

import type { ExecutorContext } from "../executor/task-executor";
import { getProblemById, listProblemsBySprint } from "../../repositories/signal.repository";
import { createOpportunity } from "../../repositories/opportunity.repository";
import { generateJson } from "../ai/openai-client";
import { GENERATE_OPPORTUNITIES_SYSTEM, GENERATE_OPPORTUNITIES_USER } from "../ai/prompts";

// ============================================================================
// TYPES
// ============================================================================

export interface GenerateOpportunitiesInput {
  sprintId: string;
  problemIds: string[];
}

export interface GenerateOpportunitiesOutput {
  opportunityIds: string[];
  generated: number;
}

interface GeneratedOpportunity {
  title: string;
  description: string;
  targetSegment: string;
  problemIds: string[];
}

interface GenerateOpportunitiesResponse {
  opportunities: GeneratedOpportunity[];
}

// ============================================================================
// EXECUTOR
// ============================================================================

export async function executeGenerateOpportunities(
  ctx: ExecutorContext,
  input: GenerateOpportunitiesInput
): Promise<GenerateOpportunitiesOutput> {
  const { db, openaiApiKey, sprintId } = ctx;
  let problemIds = input.problemIds;

  // problemIds가 비어있으면 스프린트의 모든 문제 대상
  if (!problemIds || problemIds.length === 0) {
    const allProblems = await listProblemsBySprint(db, sprintId);
    problemIds = allProblems.map((p) => p.id);
  }

  if (problemIds.length === 0) {
    return { opportunityIds: [], generated: 0 };
  }

  // 문제 데이터 조회
  const problems: Array<{ id: string; statement: string; targetSegment: string | null }> = [];
  for (const problemId of problemIds) {
    const problem = await getProblemById(db, problemId);
    if (problem) {
      problems.push({
        id: problem.id,
        statement: problem.statement,
        targetSegment: problem.targetSegment,
      });
    }
  }

  if (problems.length === 0) {
    return { opportunityIds: [], generated: 0 };
  }

  // 배치 크기 제한
  const BATCH_SIZE = 15;
  const opportunityIds: string[] = [];

  for (let i = 0; i < problems.length; i += BATCH_SIZE) {
    const batch = problems.slice(i, i + BATCH_SIZE);

    // AI 기회 생성
    const response = await generateJson<GenerateOpportunitiesResponse>(
      openaiApiKey,
      GENERATE_OPPORTUNITIES_SYSTEM,
      GENERATE_OPPORTUNITIES_USER(batch),
      { temperature: 0.7, maxTokens: 4096 }
    );

    // 기회 생성
    for (const generatedOpp of response.opportunities) {
      // 유효성 검사
      if (!generatedOpp.title || generatedOpp.title.length < 5) {
        continue;
      }

      // problemIds 유효성 검사
      const validProblemIds = generatedOpp.problemIds.filter((id) =>
        problemIds.includes(id)
      );

      const opportunity = await createOpportunity(db, sprintId, {
        title: generatedOpp.title,
        description: generatedOpp.description || undefined,
        targetSegment: generatedOpp.targetSegment || undefined,
        problemIds: validProblemIds.length > 0 ? validProblemIds : undefined,
        metadata: {
          generatedBy: "agent",
          batchIndex: Math.floor(i / BATCH_SIZE),
        },
      });

      opportunityIds.push(opportunity.id);
    }
  }

  return {
    opportunityIds,
    generated: opportunityIds.length,
  };
}
