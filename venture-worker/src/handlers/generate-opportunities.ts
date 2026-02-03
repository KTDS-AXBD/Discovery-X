/**
 * GENERATE_OPPORTUNITIES 핸들러
 * - 문제에서 기회 카드 생성
 */

import type { Env, VdTaskQueueItem, TaskHandler } from "../types";
import { callClaude } from "../lib/claude";
import { getProblems, insertOpportunity, insertWorkEvent } from "../db";
import { generateUUID } from "../lib/uuid";

const SYSTEM_PROMPT = `당신은 비즈니스 기회 발굴 전문가입니다.
식별된 문제들을 분석하여 실행 가능한 비즈니스 기회를 도출합니다.

각 기회는:
- 명확한 가치 제안을 포함해야 합니다
- 대상 고객이 명확해야 합니다
- 실현 가능성이 있어야 합니다
- 차별화 포인트가 있어야 합니다

하나의 문제에서 여러 기회가 나올 수 있고,
여러 문제를 통합하여 하나의 기회를 만들 수도 있습니다.`;

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    opportunities: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "기회 제목 (50자 이내)",
          },
          description: {
            type: "string",
            description: "기회 설명 - 가치 제안, 차별화 포인트 포함 (300자 이내)",
          },
          targetSegment: {
            type: "string",
            description: "대상 고객 세그먼트",
          },
          relatedProblemIndices: {
            type: "array",
            items: { type: "integer" },
            description: "관련 문제 인덱스 (0부터 시작)",
          },
        },
        required: ["title", "description", "targetSegment", "relatedProblemIndices"],
      },
      minItems: 1,
      maxItems: 15,
    },
  },
  required: ["opportunities"],
};

interface GenerateOpportunitiesInput {
  sprintId: string;
  problemIds?: string[];
}

interface OpportunityOutput {
  title: string;
  description: string;
  targetSegment: string;
  relatedProblemIndices: number[];
}

interface ClaudeOutput {
  opportunities: OpportunityOutput[];
}

export const generateOpportunitiesHandler: TaskHandler = {
  taskType: "GENERATE_OPPORTUNITIES",

  async execute(env: Env, task: VdTaskQueueItem): Promise<Record<string, unknown>> {
    const input = task.input as GenerateOpportunitiesInput | null;
    const sprintId = input?.sprintId || task.sprintId;
    if (!sprintId) {
      throw new Error("sprintId is required");
    }

    // 1. 문제 조회
    const problems = await getProblems(env.DB, sprintId, input?.problemIds);
    if (problems.length === 0) {
      return { opportunitiesCreated: 0, message: "No problems found" };
    }

    // 2. 프롬프트 구성
    const problemDescriptions = problems.map((p, i) => {
      return `[${i}] ${p.statement}
   심각도: ${p.severity}/5, 빈도: ${p.frequency}/5
   대상: ${p.target_segment || "미지정"}`;
    });

    const userPrompt = `다음 문제들을 분석하여 비즈니스 기회를 도출하세요:

${problemDescriptions.join("\n\n")}

각 기회에 대해:
1. 명확하고 매력적인 제목
2. 가치 제안과 차별화 포인트를 포함한 설명
3. 대상 고객 세그먼트
4. 관련 문제 인덱스

심각도와 빈도가 높은 문제를 우선적으로 다루고,
연관된 문제들을 통합하여 더 큰 기회를 만드세요.`;

    // 3. Claude API 호출
    const result = await callClaude<ClaudeOutput>({
      apiKey: env.ANTHROPIC_API_KEY,
      model: env.CLAUDE_MODEL,
      system: SYSTEM_PROMPT,
      user: userPrompt,
      schema: OUTPUT_SCHEMA,
    });

    // 4. 기회 저장
    const createdOpportunities: string[] = [];

    for (const opportunity of result.opportunities) {
      const opportunityId = generateUUID();

      // 관련 문제 ID 매핑
      const relatedProblemIds = opportunity.relatedProblemIndices
        .filter((i) => i >= 0 && i < problems.length)
        .map((i) => problems[i].id);

      await insertOpportunity(env.DB, {
        id: opportunityId,
        sprint_id: sprintId,
        theme_id: null,
        title: opportunity.title,
        description: opportunity.description,
        problem_ids: JSON.stringify(relatedProblemIds),
        target_segment: opportunity.targetSegment,
        potential_score: null,
        confidence_score: null,
        depth_score: null,
        effort_score: null,
        recommendation: null,
        is_shortlisted: 0,
        is_final: 0,
        rank: null,
        metadata: JSON.stringify({ generatedBy: "venture-worker" }),
      });

      createdOpportunities.push(opportunityId);
    }

    // 5. Work Event 기록
    await insertWorkEvent(env.DB, {
      id: generateUUID(),
      sprintId: sprintId,
      eventType: "OPPORTUNITIES_GENERATED",
      actorType: "agent",
      entityType: "task",
      entityId: task.id,
      metadata: { count: createdOpportunities.length, opportunityIds: createdOpportunities },
    });

    return {
      opportunitiesCreated: createdOpportunities.length,
      opportunityIds: createdOpportunities,
    };
  },
};
