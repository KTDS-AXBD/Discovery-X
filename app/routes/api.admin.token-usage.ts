/**
 * GET /api/admin/token-usage — Token usage history (ADMIN only)
 * Query params: range=7d|30d, mode=all|default|ideas|direct
 */

import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import type { DB } from "~/db";
import { getDb } from "~/db";
import { agentConfig } from "~/db/schema";
import { tokenUsageLogs } from "~/db/token-usage-schema";
import { eq, desc, sql, and, gte } from "drizzle-orm";
import { requireAdmin, getSessionSecret } from "~/lib/auth/session.server";

async function getDailySummary(db: DB, range: "7d" | "30d", mode: string) {
  const days = range === "30d" ? 30 : 7;
  const since = new Date(Date.now() - days * 86400 * 1000);
  const conditions = [gte(tokenUsageLogs.createdAt, since)];
  if (mode !== "all") conditions.push(eq(tokenUsageLogs.mode, mode));

  return db
    .select({
      date: sql<string>`date(${tokenUsageLogs.createdAt}, 'unixepoch')`.as("date"),
      mode: tokenUsageLogs.mode,
      totalTokens: sql<number>`sum(${tokenUsageLogs.totalTokens})`.as("total_tokens"),
      requestCount: sql<number>`count(*)`.as("request_count"),
    })
    .from(tokenUsageLogs)
    .where(and(...conditions))
    .groupBy(sql`date(${tokenUsageLogs.createdAt}, 'unixepoch')`, tokenUsageLogs.mode)
    .orderBy(sql`date(${tokenUsageLogs.createdAt}, 'unixepoch')`);
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

async function getRecentLogs(db: DB, mode: string) {
  return db
    .select({
      id: tokenUsageLogs.id,
      mode: tokenUsageLogs.mode,
      model: tokenUsageLogs.model,
      inputTokens: tokenUsageLogs.inputTokens,
      outputTokens: tokenUsageLogs.outputTokens,
      totalTokens: tokenUsageLogs.totalTokens,
      toolRounds: tokenUsageLogs.toolRounds,
      createdAt: tokenUsageLogs.createdAt,
    })
    .from(tokenUsageLogs)
    .where(mode !== "all" ? eq(tokenUsageLogs.mode, mode) : undefined)
    .orderBy(desc(tokenUsageLogs.createdAt))
    .limit(50);
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  try {
    const db = getDb(context.cloudflare.env.DB);
    const secret = getSessionSecret(context.cloudflare.env);
    await requireAdmin(request, db, secret);

    const url = new URL(request.url);
    const range = (url.searchParams.get("range") || "7d") as "7d" | "30d";
    const mode = url.searchParams.get("mode") || "all";

    const [dailySummary, todayUsage, recentLogs] = await Promise.all([
      getDailySummary(db, range, mode),
      getTodayUsage(db),
      getRecentLogs(db, mode),
    ]);

    return json({ dailySummary, todayUsage, recentLogs });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.admin.token-usage] error:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}
