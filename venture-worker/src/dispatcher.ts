/**
 * Task Dispatcher
 * - Task Queue 폴링
 * - 핸들러 실행
 * - 결과 보고
 */

import type { Env, VdTaskQueueItem, DispatcherStats } from "./types";
import { claimTasks, completeTask, failTask } from "./db";
import { getHandler } from "./handlers";
import { classifyError } from "./lib/error-classifier";

/**
 * 디스패처 실행
 */
export async function runDispatcher(env: Env): Promise<DispatcherStats> {
  const stats: DispatcherStats = {
    claimed: 0,
    completed: 0,
    failed: 0,
    errors: [],
  };

  const batchSize = parseInt(env.POLL_BATCH_SIZE, 10) || 5;
  const maxConcurrent = parseInt(env.MAX_CONCURRENT, 10) || 3;

  console.log(`[dispatcher] Starting with batch=${batchSize}, concurrent=${maxConcurrent}`);

  try {
    // 1. Task 가져오기 (claim)
    const tasks = await claimTasks(env.DB, batchSize);
    stats.claimed = tasks.length;

    if (tasks.length === 0) {
      console.log("[dispatcher] No pending tasks");
      return stats;
    }

    console.log(`[dispatcher] Claimed ${tasks.length} tasks`);

    // 2. 동시 실행 (maxConcurrent 제한)
    const chunks = chunkArray(tasks, maxConcurrent);

    for (const chunk of chunks) {
      await Promise.all(chunk.map((task) => executeTask(env, task, stats)));
    }

    console.log(
      `[dispatcher] Completed: ${stats.completed}, Failed: ${stats.failed}`
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[dispatcher] Fatal error: ${errorMessage}`);
    stats.errors.push(errorMessage);
  }

  return stats;
}

/**
 * 단일 Task 실행
 */
async function executeTask(
  env: Env,
  task: VdTaskQueueItem,
  stats: DispatcherStats
): Promise<void> {
  const startTime = Date.now();
  console.log(`[task:${task.id}] Starting ${task.taskType}`);

  try {
    // 핸들러 가져오기
    const handler = getHandler(task.taskType);

    // 핸들러 실행
    const result = await handler.execute(env, task);

    // 완료 처리
    await completeTask(env.DB, task.id, result);
    stats.completed++;

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[task:${task.id}] Completed in ${elapsed}s`);
  } catch (error) {
    const classified = classifyError(error);
    console.error(`[task:${task.id}] Failed: ${classified.message}`);

    // 실패 처리
    await failTask(env.DB, task.id, classified.message, classified.isRetryable);
    stats.failed++;
    stats.errors.push(`${task.taskType}: ${classified.message}`);
  }
}

/**
 * 배열을 청크로 나누기
 */
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}
