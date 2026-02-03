/**
 * PREPARE_GATE 핸들러
 * - Gate 의사결정을 위한 자료 준비
 */

import type { Env, VdTaskQueueItem, TaskHandler } from "../types";
import { callClaude } from "../lib/claude";
import {
  getSprint,
  getOpportunities,
  getThemes,
  insertDecision,
  insertWorkEvent,
} from "../db";
import { generateUUID } from "../lib/uuid";

const SYSTEM_PROMPT = `당신은 비즈니스 의사결정 지원 전문가입니다.
Gate 리뷰를 위한 의사결정 자료를 준비합니다.

Gate1: 기회 Shortlist 선정
- 전체 기회 중 상위 5-7개 선정
- 선정 기준: 잠재력, 확신도, 전략적 적합성

Gate2: 최종 선정
- Shortlist 중 최종 1-3개 선정
- 선정 기준: 깊이 분석 결과, 실행 가능성, 리스크

의사결정 권고안은 객관적이고 근거 기반이어야 합니다.`;

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    recommendation: {
      type: "string",
      description: "주요 권고사항 (한 문장)",
    },
    rationale: {
      type: "string",
      description: "권고 근거 (2-3 문장)",
    },
    shortlistRecommendation: {
      type: "array",
      items: {
        type: "object",
        properties: {
          opportunityIndex: { type: "integer" },
          action: {
            type: "string",
            enum: ["INCLUDE", "EXCLUDE", "DISCUSS"],
          },
          reason: { type: "string" },
        },
        required: ["opportunityIndex", "action", "reason"],
      },
      description: "각 기회에 대한 선정/제외 권고",
    },
    alternatives: {
      type: "array",
      items: {
        type: "object",
        properties: {
          option: { type: "string" },
          pros: {
            type: "array",
            items: { type: "string" },
          },
          cons: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["option", "pros", "cons"],
      },
      description: "대안 옵션들",
    },
    riskFlags: {
      type: "array",
      items: { type: "string" },
      description: "주의 사항/위험 요소",
    },
    confidence: {
      type: "integer",
      minimum: 0,
      maximum: 100,
      description: "권고 확신도",
    },
  },
  required: ["recommendation", "rationale", "shortlistRecommendation", "confidence"],
};

interface PrepareGateInput {
  sprintId: string;
  gateType: "GATE1" | "GATE2";
}

interface ShortlistRecommendation {
  opportunityIndex: number;
  action: string;
  reason: string;
}

interface Alternative {
  option: string;
  pros: string[];
  cons: string[];
}

interface ClaudeOutput {
  recommendation: string;
  rationale: string;
  shortlistRecommendation: ShortlistRecommendation[];
  alternatives?: Alternative[];
  riskFlags?: string[];
  confidence: number;
}

export const prepareGateHandler: TaskHandler = {
  taskType: "PREPARE_GATE",

  async execute(env: Env, task: VdTaskQueueItem): Promise<Record<string, unknown>> {
    const input = task.input as PrepareGateInput | null;
    if (!input?.sprintId || !input?.gateType) {
      throw new Error("sprintId and gateType are required");
    }

    // 1. Sprint 정보 조회
    const sprint = await getSprint(env.DB, input.sprintId);
    if (!sprint) {
      throw new Error(`Sprint not found: ${input.sprintId}`);
    }

    // 2. 기회 조회 (Gate 타입에 따라 필터)
    const opportunities = await getOpportunities(env.DB, input.sprintId);

    let filteredOpportunities = opportunities;
    if (input.gateType === "GATE2") {
      // Gate2는 Shortlisted 기회만
      filteredOpportunities = opportunities.filter((o) => o.is_shortlisted === 1);
    }

    if (filteredOpportunities.length === 0) {
      return { decisionCreated: false, message: "No opportunities to evaluate" };
    }

    // 3. 테마 조회
    const themes = await getThemes(env.DB, input.sprintId);
    const themeMap = new Map(themes.map((t) => [t.id, t.name]));

    // 4. 프롬프트 구성
    const opportunityDescriptions = filteredOpportunities.map((o, i) => {
      const themeName = o.theme_id ? themeMap.get(o.theme_id) || "미분류" : "미분류";
      return `[${i}] ${o.title}
   테마: ${themeName}
   대상: ${o.target_segment || "미지정"}
   잠재력: ${o.potential_score ?? "?"}/100
   확신도: ${o.confidence_score ?? "?"}/100
   깊이: ${o.depth_score ?? "?"}/100
   노력: ${o.effort_score ?? "?"}/100
   추천: ${o.recommendation || "미지정"}`;
    });

    const gateDescription =
      input.gateType === "GATE1"
        ? "전체 기회 중 Deep Dive 대상 5-7개를 선정하는 Gate1 리뷰"
        : "Shortlist 기회 중 최종 투자 대상 1-3개를 선정하는 Gate2 리뷰";

    const userPrompt = `다음 비즈니스 기회들에 대한 ${gateDescription}를 준비하세요:

스프린트: ${sprint.name}
현재 단계: ${sprint.status}

기회 목록:
${opportunityDescriptions.join("\n\n")}

각 기회에 대해 INCLUDE/EXCLUDE/DISCUSS 권고와 함께
종합적인 의사결정 지원 자료를 준비하세요.`;

    // 5. Claude API 호출
    const result = await callClaude<ClaudeOutput>({
      apiKey: env.ANTHROPIC_API_KEY,
      model: env.CLAUDE_MODEL,
      system: SYSTEM_PROMPT,
      user: userPrompt,
      schema: OUTPUT_SCHEMA,
      maxTokens: 4096,
    });

    // 6. Decision 저장
    const decisionId = generateUUID();
    const decisionType = input.gateType === "GATE1" ? "GATE1_SHORTLIST" : "GATE2_FINAL";

    // 24시간 타임아웃
    const timeoutAt = Math.floor(Date.now() / 1000) + 24 * 60 * 60;

    await insertDecision(env.DB, {
      id: decisionId,
      sprint_id: input.sprintId,
      decision_type: decisionType,
      status: "PENDING",
      agent_recommendation: JSON.stringify({
        recommendation: result.recommendation,
        rationale: result.rationale,
        alternatives: result.alternatives || [],
        riskFlags: result.riskFlags || [],
        confidence: result.confidence,
        shortlistRecommendation: result.shortlistRecommendation,
      }),
      selected_option: null,
      human_rationale: null,
      decided_at: null,
      decided_by: null,
      timeout_at: timeoutAt,
    });

    // 7. Work Event 기록
    await insertWorkEvent(env.DB, {
      id: generateUUID(),
      sprintId: input.sprintId,
      eventType: "GATE_PREPARED",
      actorType: "agent",
      entityType: "decision",
      entityId: decisionId,
      metadata: {
        gateType: input.gateType,
        opportunityCount: filteredOpportunities.length,
        confidence: result.confidence,
      },
    });

    return {
      decisionCreated: true,
      decisionId,
      gateType: input.gateType,
      opportunitiesEvaluated: filteredOpportunities.length,
    };
  },
};
