/**
 * GENERATE_DEEPDIVE 핸들러
 * - Assumption/Pre-mortem/Lean Canvas 초안 생성
 */

import type { Env, VdTaskQueueItem, TaskHandler } from "../types";
import { callClaude } from "../lib/claude";
import {
  getOpportunities,
  insertAssumption,
  insertPremortem,
  insertArtifact,
  insertWorkEvent,
} from "../db";
import { generateUUID } from "../lib/uuid";

const SYSTEM_PROMPT = `당신은 비즈니스 분석 전문가입니다.
기회에 대한 Deep Dive 분석을 수행합니다:

1. 핵심 가정 (Assumptions)
   - 이 기회가 성공하기 위해 참이어야 하는 가정들
   - 각 가정의 중요도와 검증 방법

2. Pre-mortem 분석
   - 이 기회가 실패할 수 있는 시나리오들
   - 각 시나리오의 발생 확률과 영향도
   - 완화 전략

3. Lean Canvas
   - 문제, 솔루션, 핵심 지표, 가치 제안
   - 불공정한 우위, 고객 세그먼트, 채널
   - 비용 구조, 수익 흐름`;

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    assumptions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          statement: {
            type: "string",
            description: "가정 진술",
          },
          criticality: {
            type: "integer",
            minimum: 1,
            maximum: 5,
            description: "중요도 (1=낮음, 5=매우 중요)",
          },
          confidence: {
            type: "integer",
            minimum: 0,
            maximum: 100,
            description: "현재 확신도 (검증 전)",
          },
          validationMethod: {
            type: "string",
            description: "검증 방법",
          },
        },
        required: ["statement", "criticality", "confidence", "validationMethod"],
      },
      minItems: 3,
      maxItems: 7,
    },
    premortems: {
      type: "array",
      items: {
        type: "object",
        properties: {
          failureScenario: {
            type: "string",
            description: "실패 시나리오",
          },
          probability: {
            type: "integer",
            minimum: 0,
            maximum: 100,
            description: "발생 확률 (%)",
          },
          impact: {
            type: "integer",
            minimum: 1,
            maximum: 5,
            description: "영향도 (1=낮음, 5=치명적)",
          },
          mitigationStrategy: {
            type: "string",
            description: "완화 전략",
          },
        },
        required: ["failureScenario", "probability", "impact", "mitigationStrategy"],
      },
      minItems: 3,
      maxItems: 5,
    },
    leanCanvas: {
      type: "object",
      properties: {
        problem: {
          type: "array",
          items: { type: "string" },
          description: "해결하려는 문제 (1-3개)",
        },
        solution: {
          type: "array",
          items: { type: "string" },
          description: "제안하는 솔루션 (1-3개)",
        },
        keyMetrics: {
          type: "array",
          items: { type: "string" },
          description: "핵심 측정 지표 (1-3개)",
        },
        valueProposition: {
          type: "string",
          description: "핵심 가치 제안 (한 문장)",
        },
        unfairAdvantage: {
          type: "string",
          description: "경쟁 우위 요소",
        },
        customerSegments: {
          type: "array",
          items: { type: "string" },
          description: "목표 고객 세그먼트",
        },
        channels: {
          type: "array",
          items: { type: "string" },
          description: "고객 도달 채널",
        },
        costStructure: {
          type: "array",
          items: { type: "string" },
          description: "주요 비용 요소",
        },
        revenueStreams: {
          type: "array",
          items: { type: "string" },
          description: "수익 창출 방안",
        },
      },
      required: [
        "problem",
        "solution",
        "keyMetrics",
        "valueProposition",
        "customerSegments",
      ],
    },
  },
  required: ["assumptions", "premortems", "leanCanvas"],
};

interface GenerateDeepDiveInput {
  sprintId: string;
  opportunityIds: string[];
}

interface AssumptionOutput {
  statement: string;
  criticality: number;
  confidence: number;
  validationMethod: string;
}

interface PremortemOutput {
  failureScenario: string;
  probability: number;
  impact: number;
  mitigationStrategy: string;
}

interface LeanCanvasOutput {
  problem: string[];
  solution: string[];
  keyMetrics: string[];
  valueProposition: string;
  unfairAdvantage?: string;
  customerSegments: string[];
  channels?: string[];
  costStructure?: string[];
  revenueStreams?: string[];
}

interface ClaudeOutput {
  assumptions: AssumptionOutput[];
  premortems: PremortemOutput[];
  leanCanvas: LeanCanvasOutput;
}

export const generateDeepDiveHandler: TaskHandler = {
  taskType: "GENERATE_DEEPDIVE",

  async execute(env: Env, task: VdTaskQueueItem): Promise<Record<string, unknown>> {
    const input = task.input as GenerateDeepDiveInput | null;
    if (!input?.sprintId || !input?.opportunityIds?.length) {
      throw new Error("sprintId and opportunityIds are required");
    }

    // 1. 기회 조회
    const opportunities = await getOpportunities(env.DB, input.sprintId, input.opportunityIds);
    if (opportunities.length === 0) {
      return { deepDivesCreated: 0, message: "No opportunities found" };
    }

    const stats = {
      assumptionsCreated: 0,
      premortemsCreated: 0,
      leanCanvasesCreated: 0,
    };

    // 2. 각 기회에 대해 Deep Dive 생성
    for (const opportunity of opportunities) {
      const userPrompt = `다음 비즈니스 기회에 대한 Deep Dive 분석을 수행하세요:

제목: ${opportunity.title}
설명: ${opportunity.description || "없음"}
대상 고객: ${opportunity.target_segment || "미지정"}

다음을 생성하세요:
1. 핵심 가정 3-7개
2. Pre-mortem 시나리오 3-5개
3. Lean Canvas 초안`;

      // 3. Claude API 호출
      const result = await callClaude<ClaudeOutput>({
        apiKey: env.ANTHROPIC_API_KEY,
        model: env.CLAUDE_MODEL,
        system: SYSTEM_PROMPT,
        user: userPrompt,
        schema: OUTPUT_SCHEMA,
        maxTokens: 4096,
      });

      // 4. Assumptions 저장
      for (const assumption of result.assumptions) {
        await insertAssumption(env.DB, {
          id: generateUUID(),
          opportunityId: opportunity.id,
          statement: assumption.statement,
          criticality: assumption.criticality,
          confidence: assumption.confidence,
          validationMethod: assumption.validationMethod,
          status: "OPEN",
        });
        stats.assumptionsCreated++;
      }

      // 5. Premortems 저장
      for (const premortem of result.premortems) {
        await insertPremortem(env.DB, {
          id: generateUUID(),
          opportunityId: opportunity.id,
          failureScenario: premortem.failureScenario,
          probability: premortem.probability,
          impact: premortem.impact,
          mitigationStrategy: premortem.mitigationStrategy,
        });
        stats.premortemsCreated++;
      }

      // 6. Lean Canvas 저장
      await insertArtifact(env.DB, {
        id: generateUUID(),
        opportunityId: opportunity.id,
        artifactType: "LEAN_CANVAS",
        title: `Lean Canvas - ${opportunity.title}`,
        content: result.leanCanvas as unknown as Record<string, unknown>,
        version: 1,
      });
      stats.leanCanvasesCreated++;
    }

    // 7. Work Event 기록
    await insertWorkEvent(env.DB, {
      id: generateUUID(),
      sprintId: input.sprintId,
      eventType: "DEEPDIVE_GENERATED",
      actorType: "agent",
      entityType: "task",
      entityId: task.id,
      metadata: stats,
    });

    return stats;
  },
};
