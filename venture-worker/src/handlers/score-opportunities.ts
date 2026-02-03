/**
 * SCORE_OPPORTUNITIES 핸들러
 * - 기회 카드에 4차원 점수 부여
 */

import type { Env, VdTaskQueueItem, TaskHandler } from "../types";
import { callClaude } from "../lib/claude";
import { getOpportunities, updateOpportunityScores, insertWorkEvent } from "../db";
import { generateUUID } from "../lib/uuid";

const SYSTEM_PROMPT = `당신은 비즈니스 기회 평가 전문가입니다.
각 기회를 4가지 차원에서 평가합니다:

1. Potential (잠재력): 시장 크기, 성장 가능성, 수익 잠재력
2. Confidence (확신도): 문제-해결책 적합성, 검증 수준, 근거 강도
3. Depth (깊이): 분석 깊이, 가정 검증, 리스크 파악
4. Effort (노력): 실행 복잡도, 자원 요구, 시간 예상

각 점수는 0-100 범위입니다.
또한 종합적인 추천을 제공합니다:
- INVEST: 적극 투자 추천
- EXPLORE: 추가 탐색 필요
- HOLD: 보류 (상황 변화 대기)
- DROP: 포기 추천`;

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    scores: {
      type: "array",
      items: {
        type: "object",
        properties: {
          opportunityIndex: {
            type: "integer",
            description: "기회 인덱스 (0부터 시작)",
          },
          potentialScore: {
            type: "integer",
            minimum: 0,
            maximum: 100,
            description: "잠재력 점수",
          },
          confidenceScore: {
            type: "integer",
            minimum: 0,
            maximum: 100,
            description: "확신도 점수",
          },
          depthScore: {
            type: "integer",
            minimum: 0,
            maximum: 100,
            description: "깊이 점수",
          },
          effortScore: {
            type: "integer",
            minimum: 0,
            maximum: 100,
            description: "노력 점수 (높을수록 많은 노력 필요)",
          },
          recommendation: {
            type: "string",
            enum: ["INVEST", "EXPLORE", "HOLD", "DROP"],
            description: "종합 추천",
          },
          rationale: {
            type: "string",
            description: "평가 근거 (100자 이내)",
          },
        },
        required: [
          "opportunityIndex",
          "potentialScore",
          "confidenceScore",
          "depthScore",
          "effortScore",
          "recommendation",
          "rationale",
        ],
      },
    },
  },
  required: ["scores"],
};

interface ScoreOpportunitiesInput {
  sprintId: string;
  opportunityIds?: string[];
  presetId?: string;
}

interface ScoreOutput {
  opportunityIndex: number;
  potentialScore: number;
  confidenceScore: number;
  depthScore: number;
  effortScore: number;
  recommendation: string;
  rationale: string;
}

interface ClaudeOutput {
  scores: ScoreOutput[];
}

export const scoreOpportunitiesHandler: TaskHandler = {
  taskType: "SCORE_OPPORTUNITIES",

  async execute(env: Env, task: VdTaskQueueItem): Promise<Record<string, unknown>> {
    const input = task.input as ScoreOpportunitiesInput | null;
    if (!input?.sprintId) {
      throw new Error("sprintId is required");
    }

    // 1. 기회 조회
    const opportunities = await getOpportunities(env.DB, input.sprintId, input.opportunityIds);
    if (opportunities.length === 0) {
      return { opportunitiesScored: 0, message: "No opportunities found" };
    }

    // 2. 프롬프트 구성
    const opportunityDescriptions = opportunities.map((o, i) => {
      return `[${i}] ${o.title}
   ${o.description || ""}
   대상: ${o.target_segment || "미지정"}`;
    });

    const userPrompt = `다음 비즈니스 기회들을 4차원으로 평가하세요:

${opportunityDescriptions.join("\n\n")}

평가 기준:
- Potential (0-100): 시장 기회의 크기와 성장 가능성
- Confidence (0-100): 문제 검증 수준과 해결책 적합성
- Depth (0-100): 분석의 깊이와 가정 검증 수준
- Effort (0-100): 실행에 필요한 노력 (높을수록 어려움)

각 기회에 대해 점수와 INVEST/EXPLORE/HOLD/DROP 추천을 제공하세요.`;

    // 3. Claude API 호출
    const result = await callClaude<ClaudeOutput>({
      apiKey: env.ANTHROPIC_API_KEY,
      model: env.CLAUDE_MODEL,
      system: SYSTEM_PROMPT,
      user: userPrompt,
      schema: OUTPUT_SCHEMA,
    });

    // 4. 점수 업데이트
    let scoredCount = 0;

    for (const score of result.scores) {
      if (score.opportunityIndex < 0 || score.opportunityIndex >= opportunities.length) {
        continue;
      }

      const opportunityId = opportunities[score.opportunityIndex].id;

      await updateOpportunityScores(env.DB, opportunityId, {
        potentialScore: score.potentialScore,
        confidenceScore: score.confidenceScore,
        depthScore: score.depthScore,
        effortScore: score.effortScore,
        recommendation: score.recommendation,
      });

      scoredCount++;
    }

    // 5. Work Event 기록
    await insertWorkEvent(env.DB, {
      id: generateUUID(),
      sprintId: input.sprintId,
      eventType: "OPPORTUNITIES_SCORED",
      actorType: "agent",
      entityType: "task",
      entityId: task.id,
      metadata: { count: scoredCount },
    });

    return {
      opportunitiesScored: scoredCount,
    };
  },
};
