/**
 * COLLECT_SIGNALS 핸들러
 * - Scope 기반 신호 수집
 * - 외부 API 없이 LLM으로 시뮬레이션 (Prototype)
 */

import type { Env, VdTaskQueueItem, TaskHandler } from "../types";
import { callClaude } from "../lib/claude";
import { getSprintScopes, insertSignal, insertWorkEvent } from "../db";
import { generateUUID } from "../lib/uuid";

const SYSTEM_PROMPT = `당신은 시장 신호 수집 전문가입니다.
주어진 산업/기술 범위에 대해 관련성 높은 시장 신호를 생성합니다.

신호 유형:
- TREND: 시장 트렌드
- NEWS: 뉴스/이벤트
- RESEARCH: 연구/보고서
- COMPETITOR: 경쟁사 동향
- INTERNAL: 내부 피드백
- USER_FEEDBACK: 사용자 의견

각 신호는 구체적이고 검증 가능해야 합니다.`;

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    signals: {
      type: "array",
      items: {
        type: "object",
        properties: {
          signalType: {
            type: "string",
            enum: ["TREND", "NEWS", "RESEARCH", "COMPETITOR", "INTERNAL", "USER_FEEDBACK"],
          },
          title: { type: "string", description: "신호 제목 (50자 이내)" },
          summary: { type: "string", description: "신호 요약 (200자 이내)" },
          sourceTitle: { type: "string", description: "출처명" },
          relevanceScore: {
            type: "integer",
            minimum: 0,
            maximum: 100,
            description: "관련성 점수",
          },
        },
        required: ["signalType", "title", "summary", "relevanceScore"],
      },
      minItems: 3,
      maxItems: 10,
    },
  },
  required: ["signals"],
};

interface CollectSignalsInput {
  sprintId: string;
  scopeIds?: string[];
  sources?: string[];
}

interface SignalOutput {
  signalType: string;
  title: string;
  summary: string;
  sourceTitle?: string;
  relevanceScore: number;
}

interface ClaudeOutput {
  signals: SignalOutput[];
}

export const collectSignalsHandler: TaskHandler = {
  taskType: "COLLECT_SIGNALS",

  async execute(env: Env, task: VdTaskQueueItem): Promise<Record<string, unknown>> {
    const input = task.input as CollectSignalsInput | null;
    if (!input?.sprintId) {
      throw new Error("sprintId is required");
    }

    // 1. Scope 조회
    const scopes = await getSprintScopes(env.DB, input.sprintId, true);
    if (scopes.length === 0) {
      return { signalsCreated: 0, message: "No selected scopes found" };
    }

    // 2. Scope 정보로 프롬프트 구성
    const scopeDescriptions = scopes.map((s) => {
      const parts = [s.industry];
      if (s.function) parts.push(`Function: ${s.function}`);
      if (s.technology) parts.push(`Technology: ${s.technology}`);
      if (s.geography) parts.push(`Geography: ${s.geography}`);
      if (s.keywords) {
        const keywords = JSON.parse(s.keywords) as string[];
        parts.push(`Keywords: ${keywords.join(", ")}`);
      }
      return parts.join(" | ");
    });

    const userPrompt = `다음 범위에 대해 시장 신호를 수집하세요:

${scopeDescriptions.map((s, i) => `${i + 1}. ${s}`).join("\n")}

최근 시장 동향, 기술 변화, 경쟁 상황, 사용자 피드백 등을 종합하여
각 범위당 3-5개의 관련 신호를 생성하세요.`;

    // 3. Claude API 호출
    const result = await callClaude<ClaudeOutput>({
      apiKey: env.ANTHROPIC_API_KEY,
      model: env.CLAUDE_MODEL,
      system: SYSTEM_PROMPT,
      user: userPrompt,
      schema: OUTPUT_SCHEMA,
    });

    // 4. 신호 저장
    const createdSignals: string[] = [];

    for (const signal of result.signals) {
      const signalId = generateUUID();

      await insertSignal(env.DB, {
        id: signalId,
        sprint_id: input.sprintId,
        signal_type: signal.signalType,
        title: signal.title,
        summary: signal.summary,
        source_url: null,
        source_title: signal.sourceTitle || null,
        published_at: null,
        relevance_score: signal.relevanceScore,
        metadata: JSON.stringify({ generatedBy: "venture-worker" }),
      });

      createdSignals.push(signalId);
    }

    // 5. Work Event 기록
    await insertWorkEvent(env.DB, {
      id: generateUUID(),
      sprintId: input.sprintId,
      eventType: "SIGNALS_COLLECTED",
      actorType: "agent",
      entityType: "task",
      entityId: task.id,
      metadata: { count: createdSignals.length, signalIds: createdSignals },
    });

    return {
      signalsCreated: createdSignals.length,
      signalIds: createdSignals,
    };
  },
};
