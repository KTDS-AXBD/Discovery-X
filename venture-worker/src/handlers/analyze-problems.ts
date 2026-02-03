/**
 * ANALYZE_PROBLEMS 핸들러
 * - 신호에서 문제 추출
 */

import type { Env, VdTaskQueueItem, TaskHandler } from "../types";
import { callClaude } from "../lib/claude";
import { getSignals, insertProblem, insertWorkEvent } from "../db";
import { generateUUID } from "../lib/uuid";

const SYSTEM_PROMPT = `당신은 비즈니스 문제 분석 전문가입니다.
시장 신호를 분석하여 핵심 문제를 식별하고 구조화합니다.

문제는 다음을 포함해야 합니다:
- 명확한 문제 진술 (Who has what problem when/where)
- 심각도 (1-5): 문제가 얼마나 심각한가
- 빈도 (1-5): 문제가 얼마나 자주 발생하는가
- 대상 세그먼트: 누가 이 문제를 경험하는가

문제는 구체적이고 해결 가능해야 합니다.`;

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    problems: {
      type: "array",
      items: {
        type: "object",
        properties: {
          statement: {
            type: "string",
            description: "문제 진술 (100자 이내)",
          },
          severity: {
            type: "integer",
            minimum: 1,
            maximum: 5,
            description: "심각도 (1=낮음, 5=매우 심각)",
          },
          frequency: {
            type: "integer",
            minimum: 1,
            maximum: 5,
            description: "빈도 (1=드묾, 5=매우 빈번)",
          },
          targetSegment: {
            type: "string",
            description: "대상 고객 세그먼트",
          },
          relatedSignalIndices: {
            type: "array",
            items: { type: "integer" },
            description: "관련 신호 인덱스 (0부터 시작)",
          },
        },
        required: ["statement", "severity", "frequency", "targetSegment", "relatedSignalIndices"],
      },
      minItems: 1,
      maxItems: 10,
    },
  },
  required: ["problems"],
};

interface AnalyzeProblemsInput {
  sprintId: string;
  signalIds?: string[];
}

interface ProblemOutput {
  statement: string;
  severity: number;
  frequency: number;
  targetSegment: string;
  relatedSignalIndices: number[];
}

interface ClaudeOutput {
  problems: ProblemOutput[];
}

export const analyzeProblemsHandler: TaskHandler = {
  taskType: "ANALYZE_PROBLEMS",

  async execute(env: Env, task: VdTaskQueueItem): Promise<Record<string, unknown>> {
    const input = task.input as AnalyzeProblemsInput | null;
    const sprintId = input?.sprintId || task.sprintId;
    if (!sprintId) {
      throw new Error("sprintId is required");
    }

    // 1. 신호 조회
    const signals = await getSignals(env.DB, sprintId, input?.signalIds);
    if (signals.length === 0) {
      return { problemsCreated: 0, message: "No signals found" };
    }

    // 2. 프롬프트 구성
    const signalDescriptions = signals.map((s, i) => {
      return `[${i}] ${s.signal_type}: ${s.title}\n   ${s.summary || ""}`;
    });

    const userPrompt = `다음 시장 신호들을 분석하여 핵심 문제를 식별하세요:

${signalDescriptions.join("\n\n")}

각 문제에 대해:
1. 명확한 문제 진술 작성
2. 심각도와 빈도 평가
3. 대상 고객 세그먼트 식별
4. 관련 신호 인덱스 연결

유사한 문제는 통합하고, 가장 중요한 5-10개의 문제만 추출하세요.`;

    // 3. Claude API 호출
    const result = await callClaude<ClaudeOutput>({
      apiKey: env.ANTHROPIC_API_KEY,
      model: env.CLAUDE_MODEL,
      system: SYSTEM_PROMPT,
      user: userPrompt,
      schema: OUTPUT_SCHEMA,
    });

    // 4. 문제 저장
    const createdProblems: string[] = [];

    for (const problem of result.problems) {
      const problemId = generateUUID();

      // 관련 신호 ID 매핑
      const relatedSignalIds = problem.relatedSignalIndices
        .filter((i) => i >= 0 && i < signals.length)
        .map((i) => signals[i].id);

      await insertProblem(env.DB, {
        id: problemId,
        sprint_id: sprintId,
        statement: problem.statement,
        severity: problem.severity,
        frequency: problem.frequency,
        target_segment: problem.targetSegment,
        signal_ids: JSON.stringify(relatedSignalIds),
        metadata: JSON.stringify({ generatedBy: "venture-worker" }),
      });

      createdProblems.push(problemId);
    }

    // 5. Work Event 기록
    await insertWorkEvent(env.DB, {
      id: generateUUID(),
      sprintId: sprintId,
      eventType: "PROBLEMS_ANALYZED",
      actorType: "agent",
      entityType: "task",
      entityId: task.id,
      metadata: { count: createdProblems.length, problemIds: createdProblems },
    });

    return {
      problemsCreated: createdProblems.length,
      problemIds: createdProblems,
    };
  },
};
