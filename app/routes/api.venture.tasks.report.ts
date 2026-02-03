/**
 * Venture Task Queue - Report Task Result API
 * POST /api/venture/tasks/report
 *
 * Worker가 작업 완료/실패를 보고하는 엔드포인트
 */

import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import {
  completeTask,
  failTask,
  getTaskById,
} from "~/features/venture/repositories/task-queue.repository";
import { createWorkEvent } from "~/features/venture/repositories/analytics.repository";

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  // Worker 인증
  const authHeader = request.headers.get("Authorization");
  const env = context.cloudflare.env as { DB: D1Database; CRON_SECRET?: string };
  const expectedToken = env.CRON_SECRET;

  if (!authHeader || authHeader !== `Bearer ${expectedToken}`) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json() as {
      taskId?: string;
      status?: "COMPLETED" | "FAILED";
      output?: Record<string, unknown>;
      error?: string;
    };

    const { taskId, status, output, error } = body;

    if (!taskId) {
      return json({ error: "taskId is required" }, { status: 400 });
    }

    if (!status || !["COMPLETED", "FAILED"].includes(status)) {
      return json({ error: "status must be COMPLETED or FAILED" }, { status: 400 });
    }

    const db = getDb(env.DB);

    // 작업 존재 확인
    const existingTask = await getTaskById(db, taskId);
    if (!existingTask) {
      return json({ error: "Task not found" }, { status: 404 });
    }

    if (existingTask.status !== "RUNNING") {
      return json({ error: "Task is not in RUNNING state" }, { status: 400 });
    }

    let updatedTask;

    if (status === "COMPLETED") {
      updatedTask = await completeTask(db, taskId, output);

      // Work Event 기록
      await createWorkEvent(db, existingTask.sprintId, {
        eventType: "task_complete",
        actorType: "agent",
        actorId: `worker:${existingTask.taskType}`,
        entityId: taskId,
        metadata: { taskType: existingTask.taskType },
      });
    } else {
      if (!error) {
        return json({ error: "error message is required for FAILED status" }, { status: 400 });
      }

      updatedTask = await failTask(db, taskId, error);

      // Work Event 기록 (실패)
      await createWorkEvent(db, existingTask.sprintId, {
        eventType: "task_fail",
        actorType: "agent",
        actorId: `worker:${existingTask.taskType}`,
        entityId: taskId,
        metadata: { taskType: existingTask.taskType, error },
      });
    }

    return json({
      success: true,
      task: updatedTask,
    });
  } catch (err) {
    console.error("Task report error:", err);
    return json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
