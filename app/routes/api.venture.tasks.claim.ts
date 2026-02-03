/**
 * Venture Task Queue - Claim Tasks API
 * POST /api/venture/tasks/claim
 *
 * Worker가 처리할 작업을 가져가는 엔드포인트
 */

import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { claimTasks } from "~/features/venture/repositories/task-queue.repository";

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  // Worker 인증 (CRON_SECRET 사용)
  const authHeader = request.headers.get("Authorization");
  const env = context.cloudflare.env as { DB: D1Database; CRON_SECRET?: string };
  const expectedToken = env.CRON_SECRET;

  if (!authHeader || authHeader !== `Bearer ${expectedToken}`) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json() as { workerId?: string; limit?: number };
    const { workerId, limit = 5 } = body;

    if (!workerId) {
      return json({ error: "workerId is required" }, { status: 400 });
    }

    if (limit < 1 || limit > 20) {
      return json({ error: "limit must be between 1 and 20" }, { status: 400 });
    }

    const db = getDb(env.DB);
    const tasks = await claimTasks(db, limit);

    return json({
      success: true,
      workerId,
      tasks,
      claimedCount: tasks.length,
    });
  } catch (error) {
    console.error("Task claim error:", error);
    return json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
