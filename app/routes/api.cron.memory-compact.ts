import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { users } from "~/db/schema";
import { inArray } from "drizzle-orm";
import { MemoryLifecycle } from "~/lib/agent/memory-lifecycle";
import { TokenBudgetManager } from "~/lib/cost/token-budget";

interface CompactResult {
  usersProcessed: number;
  totalArchived: number;
  totalDeleted: number;
  totalBudgetEnforced: number;
  errors: string[];
}

// POST: 주간 Memory Compaction (매주 일요일 03:00)
export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // CRON_SECRET 검증
  const env = context.cloudflare.env as unknown as Record<string, string>;
  const cronSecret = env.CRON_SECRET;
  if (!cronSecret) {
    return Response.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }

  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (token !== cronSecret) {
    return new Response("Unauthorized", { status: 401 });
  }

  const db = getDb(env.DB as unknown as D1Database);
  const lifecycle = new MemoryLifecycle(db);
  const budgetManager = new TokenBudgetManager(db);

  // 활성 사용자 조회
  const activeUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.role, ["admin", "user"]));

  const result: CompactResult = {
    usersProcessed: 0,
    totalArchived: 0,
    totalDeleted: 0,
    totalBudgetEnforced: 0,
    errors: [],
  };

  // 각 사용자별 compaction + 토큰 예산 강제 적용 (non-fatal)
  for (const user of activeUsers) {
    try {
      const compacted = await lifecycle.compact(user.id);
      result.usersProcessed++;
      result.totalArchived += compacted.archived;
      result.totalDeleted += compacted.deleted;

      // 메모리 토큰 예산 초과 시 importance 낮은 순 정리
      const budgetDeleted = await budgetManager.enforceMemoryBudget(user.id);
      result.totalBudgetEnforced += budgetDeleted;
    } catch (e) {
      result.errors.push(
        `${user.id}: ${e instanceof Error ? e.message : "Unknown error"}`,
      );
    }
  }

  return Response.json(result);
}
