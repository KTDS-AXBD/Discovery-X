/**
 * GENERATE_ARTIFACTS 핸들러
 * - 피치 덱, 요약 문서 등 산출물 생성
 */

import type { Env, VdTaskQueueItem, TaskHandler } from "../types";
import { callClaude } from "../lib/claude";
import { getOpportunities, insertArtifact, insertWorkEvent } from "../db";
import { generateUUID } from "../lib/uuid";

const SYSTEM_PROMPT = `당신은 비즈니스 문서 작성 전문가입니다.
비즈니스 기회에 대한 다양한 산출물을 작성합니다:

1. PITCH_DECK: 투자/승인 프레젠테이션 슬라이드
2. ONE_PAGER: 한 페이지 요약 문서
3. EXECUTIVE_SUMMARY: 경영진 요약 (1-2 페이지)

각 문서는:
- 핵심 메시지가 명확해야 합니다
- 대상 독자에 맞게 작성되어야 합니다
- 시각적으로 구조화되어야 합니다
- 행동을 유도해야 합니다`;

const PITCH_DECK_SCHEMA = {
  type: "object",
  properties: {
    slides: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          content: {
            type: "array",
            items: { type: "string" },
            description: "슬라이드 내용 (불릿 포인트)",
          },
          speakerNotes: { type: "string" },
        },
        required: ["title", "content"],
      },
      minItems: 5,
      maxItems: 12,
    },
  },
  required: ["slides"],
};

const ONE_PAGER_SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string", description: "헤드라인 (한 문장)" },
    problemStatement: { type: "string", description: "문제 정의 (2-3 문장)" },
    solution: { type: "string", description: "솔루션 설명 (2-3 문장)" },
    keyBenefits: {
      type: "array",
      items: { type: "string" },
      description: "핵심 혜택 (3-5개)",
    },
    targetMarket: { type: "string", description: "목표 시장" },
    competitiveAdvantage: { type: "string", description: "경쟁 우위" },
    callToAction: { type: "string", description: "행동 유도 (CTA)" },
  },
  required: ["headline", "problemStatement", "solution", "keyBenefits", "callToAction"],
};

const EXECUTIVE_SUMMARY_SCHEMA = {
  type: "object",
  properties: {
    executiveSummary: {
      type: "string",
      description: "경영진 요약 (한 문단)",
    },
    opportunity: {
      type: "object",
      properties: {
        description: { type: "string" },
        marketSize: { type: "string" },
        growthPotential: { type: "string" },
      },
      required: ["description"],
    },
    solution: {
      type: "object",
      properties: {
        description: { type: "string" },
        uniqueValue: { type: "string" },
        readiness: { type: "string" },
      },
      required: ["description"],
    },
    businessCase: {
      type: "object",
      properties: {
        investmentRequired: { type: "string" },
        expectedReturn: { type: "string" },
        timeline: { type: "string" },
        risks: {
          type: "array",
          items: { type: "string" },
        },
      },
    },
    recommendation: { type: "string", description: "추천 사항" },
    nextSteps: {
      type: "array",
      items: { type: "string" },
      description: "다음 단계 (3-5개)",
    },
  },
  required: ["executiveSummary", "opportunity", "solution", "recommendation", "nextSteps"],
};

interface GenerateArtifactsInput {
  sprintId: string;
  opportunityIds: string[];
  artifactTypes: string[];
}

export const generateArtifactsHandler: TaskHandler = {
  taskType: "GENERATE_ARTIFACTS",

  async execute(env: Env, task: VdTaskQueueItem): Promise<Record<string, unknown>> {
    const input = task.input as GenerateArtifactsInput | null;
    if (!input?.sprintId || !input?.opportunityIds?.length || !input?.artifactTypes?.length) {
      throw new Error("sprintId, opportunityIds, and artifactTypes are required");
    }

    // 1. 기회 조회
    const opportunities = await getOpportunities(env.DB, input.sprintId, input.opportunityIds);
    if (opportunities.length === 0) {
      return { artifactsCreated: 0, message: "No opportunities found" };
    }

    let artifactsCreated = 0;

    // 2. 각 기회 + 산출물 타입 조합에 대해 생성
    for (const opportunity of opportunities) {
      for (const artifactType of input.artifactTypes) {
        let schema: Record<string, unknown>;
        let promptSuffix: string;

        switch (artifactType) {
          case "PITCH_DECK":
            schema = PITCH_DECK_SCHEMA;
            promptSuffix = "5-10장의 피치 덱 슬라이드를 생성하세요.";
            break;
          case "ONE_PAGER":
            schema = ONE_PAGER_SCHEMA;
            promptSuffix = "한 페이지 요약 문서를 생성하세요.";
            break;
          case "EXECUTIVE_SUMMARY":
            schema = EXECUTIVE_SUMMARY_SCHEMA;
            promptSuffix = "경영진 요약 문서를 생성하세요.";
            break;
          default:
            continue; // 지원하지 않는 타입 스킵
        }

        const userPrompt = `다음 비즈니스 기회에 대한 산출물을 생성하세요:

제목: ${opportunity.title}
설명: ${opportunity.description || "없음"}
대상 고객: ${opportunity.target_segment || "미지정"}
잠재력 점수: ${opportunity.potential_score ?? "미평가"}/100
추천: ${opportunity.recommendation || "미지정"}

${promptSuffix}`;

        // 3. Claude API 호출
        const result = await callClaude<Record<string, unknown>>({
          apiKey: env.ANTHROPIC_API_KEY,
          model: env.CLAUDE_MODEL,
          system: SYSTEM_PROMPT,
          user: userPrompt,
          schema,
          maxTokens: 4096,
        });

        // 4. Artifact 저장
        await insertArtifact(env.DB, {
          id: generateUUID(),
          opportunityId: opportunity.id,
          artifactType,
          title: `${artifactType} - ${opportunity.title}`,
          content: result,
          version: 1,
        });

        artifactsCreated++;
      }
    }

    // 5. Work Event 기록
    await insertWorkEvent(env.DB, {
      id: generateUUID(),
      sprintId: input.sprintId,
      eventType: "ARTIFACTS_GENERATED",
      actorType: "agent",
      entityType: "task",
      entityId: task.id,
      metadata: { count: artifactsCreated, types: input.artifactTypes },
    });

    return {
      artifactsCreated,
    };
  },
};
