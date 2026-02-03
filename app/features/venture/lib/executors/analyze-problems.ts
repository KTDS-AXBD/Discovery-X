/**
 * ANALYZE_PROBLEMS Executor
 *
 * 수집된 신호에서 AI를 활용하여 문제를 추출하고 분석합니다.
 */

import type { ExecutorContext } from "../executor/task-executor";
import { getSignalById, listSignalsBySprint, createProblem } from "../../repositories/signal.repository";
import { generateJson } from "../ai/openai-client";
import { ANALYZE_PROBLEMS_SYSTEM, ANALYZE_PROBLEMS_USER } from "../ai/prompts";

// ============================================================================
// TYPES
// ============================================================================

export interface AnalyzeProblemsInput {
  sprintId: string;
  signalIds: string[];
}

export interface AnalyzeProblemsOutput {
  problemIds: string[];
  analyzed: number;
}

interface AnalyzedProblem {
  statement: string;
  severity: number;
  frequency: number;
  targetSegment: string;
  signalIds: string[];
}

interface AnalyzeProblemsResponse {
  problems: AnalyzedProblem[];
}

// ============================================================================
// EXECUTOR
// ============================================================================

export async function executeAnalyzeProblems(
  ctx: ExecutorContext,
  input: AnalyzeProblemsInput
): Promise<AnalyzeProblemsOutput> {
  const { db, openaiApiKey, sprintId } = ctx;
  let signalIds = input.signalIds;

  // signalIds가 비어있으면 스프린트의 모든 신호 대상
  if (!signalIds || signalIds.length === 0) {
    const allSignals = await listSignalsBySprint(db, sprintId);
    signalIds = allSignals.map((s) => s.id);
  }

  if (signalIds.length === 0) {
    return { problemIds: [], analyzed: 0 };
  }

  // 신호 데이터 조회
  const signals: Array<{ id: string; title: string; summary: string | null }> = [];
  for (const signalId of signalIds) {
    const signal = await getSignalById(db, signalId);
    if (signal) {
      signals.push({
        id: signal.id,
        title: signal.title,
        summary: signal.summary,
      });
    }
  }

  if (signals.length === 0) {
    return { problemIds: [], analyzed: 0 };
  }

  // 배치 크기 제한 (토큰 제한 대응)
  const BATCH_SIZE = 20;
  const problemIds: string[] = [];

  for (let i = 0; i < signals.length; i += BATCH_SIZE) {
    const batch = signals.slice(i, i + BATCH_SIZE);

    // AI 문제 분석
    const response = await generateJson<AnalyzeProblemsResponse>(
      openaiApiKey,
      ANALYZE_PROBLEMS_SYSTEM,
      ANALYZE_PROBLEMS_USER(batch),
      { temperature: 0.5, maxTokens: 4096 }
    );

    // 문제 생성
    for (const analyzedProblem of response.problems) {
      // 유효성 검사
      if (!analyzedProblem.statement || analyzedProblem.statement.length < 10) {
        continue;
      }

      // signalIds 유효성 검사 (입력된 신호 ID만 허용)
      const validSignalIds = analyzedProblem.signalIds.filter((id) =>
        signalIds.includes(id)
      );

      const problem = await createProblem(db, sprintId, {
        statement: analyzedProblem.statement,
        severity: Math.min(Math.max(analyzedProblem.severity || 3, 1), 5),
        frequency: Math.min(Math.max(analyzedProblem.frequency || 3, 1), 5),
        targetSegment: analyzedProblem.targetSegment || undefined,
        signalIds: validSignalIds.length > 0 ? validSignalIds : undefined,
        metadata: {
          generatedBy: "agent",
          batchIndex: Math.floor(i / BATCH_SIZE),
        },
      });

      problemIds.push(problem.id);
    }
  }

  return {
    problemIds,
    analyzed: signals.length,
  };
}
