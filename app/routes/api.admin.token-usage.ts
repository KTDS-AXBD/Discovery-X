/**
 * GET /api/admin/token-usage — Token usage history (ADMIN only)
 * Query params: range=7d|30d, purpose=all|chat|analysis|extraction|batch|agent-tool|eval
 */

import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import type { DB } from "~/db";
import { getDb } from "~/db";
import { agentConfig } from "~/db";
import { usageEvents } from "~/features/cost/db/schema";
import { eq, desc, sql, and, gte } from "drizzle-orm";
import { requireAdmin, getSessionSecret } from "~/lib/auth/session.server";

async function getDailySummary(db: DB, range: "7d" | "30d", purpose: string) {
  const days = range === "30d" ? 30 : 7;
  const since = new Date(Date.now() - days * 86400 * 1000);
  const conditions = [gte(usageEvents.createdAt, since)];
  if (purpose !== "all") conditions.push(eq(usageEvents.purpose, purpose));

  return db
    .select({
      date: sql<string>`date(${usageEvents.createdAt}, 'unixepoch')`.as("date"),
      mode: usageEvents.purpose,
      totalTokens: sql<number>`sum(${usageEvents.totalTokens})`.as("total_tokens"),
      requestCount: sql<number>`count(*)`.as("request_count"),
    })
    .from(usageEvents)
    .where(and(...conditions))
    .groupBy(sql`date(${usageEvents.createdAt}, 'unixepoch')`, usageEvents.purpose)
    .orderBy(sql`date(${usageEvents.createdAt}, 'unixepoch')`);
}

async function getTodayUsage(db: DB) {
  const rows = await db
    .select()
    .from(agentConfig)
    .where(eq(agentConfig.id, "default"))
    .limit(1);
  return rows[0]
    ? {
        tokensUsedToday: rows[0].tokensUsedToday,
        dailyTokenBudget: rows[0].dailyTokenBudget,
        tokenResetDate: rows[0].tokenResetDate,
      }
    : { tokensUsedToday: 0, dailyTokenBudget: 100000, tokenResetDate: null };
}

async function getRecentLogs(db: DB, purpose: string) {
  return db
    .select({
      id: usageEvents.id,
      mode: usageEvents.purpose,
      model: usageEvents.model,
      provider: usageEvents.provider,
      inputTokens: usageEvents.inputTokens,
      outputTokens: usageEvents.outputTokens,
      totalTokens: usageEvents.totalTokens,
      toolRounds: usageEvents.toolRounds,
      createdAt: usageEvents.createdAt,
    })
    .from(usageEvents)
    .where(purpose !== "all" ? eq(usageEvents.purpose, purpose) : undefined)
    .orderBy(desc(usageEvents.createdAt))
    .limit(50);
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  try {
    const db = getDb(context.cloudflare.env.DB);
    const secret = getSessionSecret(context.cloudflare.env);
    await requireAdmin(request, db, secret);

    const url = new URL(request.url);
    const range = (url.searchParams.get("range") || "7d") as "7d" | "30d";
    // 하위 호환: mode 파라미터도 purpose로 매핑
    const purpose = url.searchParams.get("purpose") || url.searchParams.get("mode") || "all";

    const [dailySummary, todayUsage, recentLogs] = await Promise.all([
      getDailySummary(db, range, purpose),
      getTodayUsage(db),
      getRecentLogs(db, purpose),
    ]);

    return json({ dailySummary, todayUsage, recentLogs });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.admin.token-usage] error:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}
