/**
 * Venture Task Worker API
 *
 * GET /api/venture/worker?secret=xxx
 *
 * Cron 또는 수동 호출로 대기중인 Task를 실행합니다.
 */

import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { claimTasks, completeTask, failTask, listStuckTasks } from "~/features/venture/repositories/task-queue.repository";
import { executeTask, type WorkerEnv } from "~/features/venture/lib/executor/task-executor";
import { vdWorkEvents } from "~/features/venture/db/schema";

// ============================================================================
// LOADER
// ============================================================================

export async function loader({ request, context }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");

  // 인증 검사
  const env = context.cloudflare.env as WorkerEnv & { CRON_SECRET?: string };
  if (env.CRON_SECRET && secret !== env.CRON_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 디버그 모드: env 키 확인 (값은 출력하지 않음)
  if (url.searchParams.get("debug") === "env") {
    const envKeys = Object.keys(env);
    const hasOpenAI = !!env.OPENAI_API_KEY;
    return Response.json({
      envKeys,
      hasOpenAI,
      openaiKeyLength: env.OPENAI_API_KEY?.length || 0,
    });
  }

  const db = getDb(context.cloudflare.env.DB);
  const limit = parseInt(url.searchParams.get("limit") || "5", 10);
  const timeoutMinutes = parseInt(url.searchParams.get("timeout") || "30", 10);

  const results: Array<{
    taskId: string;
    taskType: string;
    success: boolean;
    output?: unknown;
    error?: string;
    durationMs: number;
  }> = [];

  try {
    // 1. Stuck tasks 처리 (타임아웃)
    const stuckTasks = await listStuckTasks(db, timeoutMinutes);
    for (const stuckTask of stuckTasks) {
      await failTask(db, stuckTask.id, `Task timeout after ${timeoutMinutes} minutes`);
      results.push({
        taskId: stuckTask.id,
        taskType: stuckTask.taskType,
        success: false,
        error: "TIMEOUT",
        durationMs: 0,
      });
    }

    // 2. 대기 중인 Task claim
    const tasks = await claimTasks(db, limit);

    if (tasks.length === 0) {
      return Response.json({
        message: "No pending tasks",
        processed: 0,
        stuckRecovered: stuckTasks.length,
        results,
      });
    }

    // 3. 각 Task 실행
    for (const task of tasks) {
      const startTime = Date.now();

      const result = await executeTask(db, task, env);
      const durationMs = Date.now() - startTime;

      if (result.success) {
        // 성공: Task 완료 처리
        await completeTask(db, task.id, result.output as Record<string, unknown>);

        // WorkEvent 기록
        await db.insert(vdWorkEvents).values({
          id: crypto.randomUUID(),
          sprintId: task.sprintId,
          eventType: `task_${task.taskType.toLowerCase()}_completed`,
          actorType: "agent",
          entityType: "task",
          entityId: task.id,
          metadata: {
            durationMs,
            output: result.output,
          },
          createdAt: new Date(),
        });

        results.push({
          taskId: task.id,
          taskType: task.taskType,
          success: true,
          output: result.output,
          durationMs,
        });
      } else {
        // 실패: Task 실패 처리 (재시도 로직은 repository에서 처리)
        const errorMessage = result.error?.message || "Unknown error";
        await failTask(db, task.id, errorMessage);

        // WorkEvent 기록
        await db.insert(vdWorkEvents).values({
          id: crypto.randomUUID(),
          sprintId: task.sprintId,
          eventType: `task_${task.taskType.toLowerCase()}_failed`,
          actorType: "agent",
          entityType: "task",
          entityId: task.id,
          metadata: {
            durationMs,
            error: result.error,
            retryable: result.error?.retryable,
          },
          createdAt: new Date(),
        });

        results.push({
          taskId: task.id,
          taskType: task.taskType,
          success: false,
          error: errorMessage,
          durationMs,
        });
      }
    }

    return Response.json({
      message: "Worker completed",
      processed: tasks.length,
      succeeded: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      stuckRecovered: stuckTasks.length,
      results,
    });
  } catch (error) {
    console.error("Worker error:", error);
    return Response.json(
      {
        error: "Worker execution failed",
        message: error instanceof Error ? error.message : String(error),
        results,
      },
      { status: 500 }
    );
  }
}
