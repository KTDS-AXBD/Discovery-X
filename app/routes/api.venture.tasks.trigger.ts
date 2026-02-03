/**
 * Venture Task 수동 트리거 API
 *
 * POST /api/venture/tasks/trigger
 *
 * 특정 Task를 수동으로 enqueue하거나 즉시 실행합니다.
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { requireUser, getSessionSecret } from "~/lib/auth/session.server";
import { enqueueTask, getTaskById } from "~/features/venture/repositories/task-queue.repository";
import { executeTaskByType, type WorkerEnv } from "~/features/venture/lib/executor/task-executor";
import type { VdTaskTypeValue } from "~/features/venture/types";
import { VD_TASK_TYPES } from "~/features/venture/constants/task-types";

// ============================================================================
// ACTION
// ============================================================================

export async function action({ request, context }: ActionFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);

  // 인증 확인
  const user = await requireUser(request, db, secret);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // admin 또는 gatekeeper만 허용
  if (user.role !== "admin" && user.role !== "gatekeeper") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const env = context.cloudflare.env as WorkerEnv;

  try {
    const body = await request.json() as {
      sprintId: string;
      taskType: VdTaskTypeValue;
      input?: Record<string, unknown>;
      immediate?: boolean;
      priority?: number;
      scheduledAt?: string;
    };

    const { sprintId, taskType, input, immediate, priority, scheduledAt } = body;

    // 필수 파라미터 검증
    if (!sprintId) {
      return Response.json({ error: "sprintId is required" }, { status: 400 });
    }

    if (!taskType) {
      return Response.json({ error: "taskType is required" }, { status: 400 });
    }

    // 유효한 taskType 검증
    if (!VD_TASK_TYPES.includes(taskType)) {
      return Response.json(
        { error: `Invalid taskType. Must be one of: ${VD_TASK_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    // 즉시 실행 모드
    if (immediate) {
      if (!env.OPENAI_API_KEY) {
        return Response.json({ error: "OPENAI_API_KEY is not configured" }, { status: 500 });
      }

      const startTime = Date.now();
      const result = await executeTaskByType(
        db,
        taskType,
        sprintId,
        input || {},
        env.OPENAI_API_KEY
      );
      const durationMs = Date.now() - startTime;

      return Response.json({
        mode: "immediate",
        taskType,
        sprintId,
        success: result.success,
        output: result.output,
        error: result.error,
        durationMs,
      });
    }

    // Queue 모드 (기본)
    const task = await enqueueTask(db, sprintId, {
      taskType,
      input,
      priority,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
    });

    return Response.json({
      mode: "queued",
      taskId: task.id,
      taskType: task.taskType,
      sprintId: task.sprintId,
      status: task.status,
      priority: task.priority,
      scheduledAt: task.scheduledAt?.toISOString(),
    });
  } catch (error) {
    console.error("Task trigger error:", error);
    return Response.json(
      {
        error: "Failed to trigger task",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// LOADER (GET - Task 상태 조회)
// ============================================================================

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);

  const user = await requireUser(request, db, secret);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const taskId = url.searchParams.get("taskId");

  if (!taskId) {
    return Response.json({ error: "taskId is required" }, { status: 400 });
  }

  const task = await getTaskById(db, taskId);

  if (!task) {
    return Response.json({ error: "Task not found" }, { status: 404 });
  }

  return Response.json({
    id: task.id,
    sprintId: task.sprintId,
    taskType: task.taskType,
    status: task.status,
    priority: task.priority,
    input: task.input,
    output: task.output,
    error: task.error,
    retryCount: task.retryCount,
    maxRetries: task.maxRetries,
    createdAt: task.createdAt?.toISOString(),
    startedAt: task.startedAt?.toISOString(),
    completedAt: task.completedAt?.toISOString(),
    scheduledAt: task.scheduledAt?.toISOString(),
  });
}
