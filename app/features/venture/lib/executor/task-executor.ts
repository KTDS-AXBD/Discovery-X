/**
 * Task Executor - 메인 라우터
 *
 * Task 타입별로 적절한 executor 함수를 호출하고 결과를 반환합니다.
 */

import type { DB } from "~/db";
import type { VdTaskQueueItem, VdTaskTypeValue } from "../../types";
import { classifyError, serializeError, type ClassifiedError } from "./error-classifier";

// Executor 함수들 (lazy import 패턴)
import { executeCollectSignals } from "../executors/collect-signals";
import { executeAnalyzeProblems } from "../executors/analyze-problems";
import { executeGenerateOpportunities } from "../executors/generate-opportunities";
import { executeClusterThemes } from "../executors/cluster-themes";
import { executeScoreOpportunities } from "../executors/score-opportunities";
import { executeGenerateDeepDive } from "../executors/generate-deepdive";
import { executeGenerateArtifacts } from "../executors/generate-artifacts";
import { executePrepareGate } from "../executors/prepare-gate";

// ============================================================================
// TYPES
// ============================================================================

export interface TaskExecutionResult<T = unknown> {
  success: boolean;
  output?: T;
  error?: { code: string; message: string; retryable: boolean };
}

export interface WorkerEnv {
  DB: D1Database;
  OPENAI_API_KEY?: string;
  CRON_SECRET?: string;
}

export interface ExecutorContext {
  db: DB;
  openaiApiKey: string;
  sprintId: string;
  taskId: string;
}

// ============================================================================
// EXECUTOR REGISTRY
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ExecutorFn = (ctx: ExecutorContext, input: any) => Promise<unknown>;

const EXECUTOR_MAP: Record<VdTaskTypeValue, ExecutorFn> = {
  COLLECT_SIGNALS: executeCollectSignals,
  ANALYZE_PROBLEMS: executeAnalyzeProblems,
  GENERATE_OPPORTUNITIES: executeGenerateOpportunities,
  CLUSTER_THEMES: executeClusterThemes,
  SCORE_OPPORTUNITIES: executeScoreOpportunities,
  GENERATE_DEEPDIVE: executeGenerateDeepDive,
  GENERATE_ARTIFACTS: executeGenerateArtifacts,
  PREPARE_GATE: executePrepareGate,
};

// ============================================================================
// MAIN EXECUTOR
// ============================================================================

/**
 * Task를 실행하고 결과를 반환
 */
export async function executeTask(
  db: DB,
  task: VdTaskQueueItem,
  env: WorkerEnv
): Promise<TaskExecutionResult> {
  // API 키 검증
  const openaiApiKey = env.OPENAI_API_KEY;
  if (!openaiApiKey) {
    return {
      success: false,
      error: {
        code: "MISSING_API_KEY",
        message: "OPENAI_API_KEY is not configured",
        retryable: false,
      },
    };
  }

  // Executor 찾기
  const executor = EXECUTOR_MAP[task.taskType as VdTaskTypeValue];
  if (!executor) {
    return {
      success: false,
      error: {
        code: "UNKNOWN_TASK_TYPE",
        message: `Unknown task type: ${task.taskType}`,
        retryable: false,
      },
    };
  }

  // 컨텍스트 생성
  const ctx: ExecutorContext = {
    db,
    openaiApiKey,
    sprintId: task.sprintId,
    taskId: task.id,
  };

  // 실행
  try {
    const output = await executor(ctx, task.input || {});
    return {
      success: true,
      output,
    };
  } catch (error) {
    const classified: ClassifiedError = classifyError(error);
    return {
      success: false,
      error: serializeError(classified),
    };
  }
}

/**
 * 특정 타입의 Task 실행 (테스트/수동 트리거용)
 */
export async function executeTaskByType<TInput, TOutput>(
  db: DB,
  taskType: VdTaskTypeValue,
  sprintId: string,
  input: TInput,
  openaiApiKey: string
): Promise<TaskExecutionResult<TOutput>> {
  const executor = EXECUTOR_MAP[taskType] as ExecutorFn | undefined;
  if (!executor) {
    return {
      success: false,
      error: {
        code: "UNKNOWN_TASK_TYPE",
        message: `Unknown task type: ${taskType}`,
        retryable: false,
      },
    };
  }

  const ctx: ExecutorContext = {
    db,
    openaiApiKey,
    sprintId,
    taskId: `manual-${Date.now()}`,
  };

  try {
    const output = await executor(ctx, input);
    return {
      success: true,
      output: output as TOutput,
    };
  } catch (error) {
    const classified = classifyError(error);
    return {
      success: false,
      error: serializeError(classified),
    };
  }
}
