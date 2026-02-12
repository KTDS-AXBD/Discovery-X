/**
 * GET /api/admin/token-usage — Token usage history (ADMIN only)
 * Query params: range=7d|30d, mode=all|default|ideas|direct
 */

import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { agentConfig } from "~/db/schema";
import { tokenUsageLogs } from "~/db/token-usage-schema";
import { eq, desc, sql, and, gte } from "drizzle-orm";
import { requireAdmin, getSessionSecret } from "~/lib/auth/session.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  await requireAdmin(request, db, secret);

  const url = new URL(request.url);
  const range = url.searchParams.get("range") || "7d";
  const modeFilter = url.searchParams.get("mode") || "all";

  // Calculate date range
  const days = range === "30d" ? 30 : 7;
  const sinceTimestamp = Math.floor(Date.now() / 1000) - days * 86400;

  // Build conditions
  const conditions = [gte(tokenUsageLogs.createdAt, new Date(sinceTimestamp * 1000))];
  if (modeFilter !== "all") {
    conditions.push(eq(tokenUsageLogs.mode, modeFilter));
  }

  // Daily summary (aggregated by date and mode)
  const dailySummary = await db
    .select({
      date: sql<string>`date(${tokenUsageLogs.createdAt}, 'unixepoch')`.as("date"),
      mode: tokenUsageLogs.mode,
      totalTokens: sql<number>`sum(${tokenUsageLogs.totalTokens})`.as("total_tokens"),
      requestCount: sql<number>`count(*)`.as("request_count"),
    })
    .from(tokenUsageLogs)
    .where(and(...conditions))
    .groupBy(
      sql`date(${tokenUsageLogs.createdAt}, 'unixepoch')`,
      tokenUsageLogs.mode
    )
    .orderBy(sql`date(${tokenUsageLogs.createdAt}, 'unixepoch')`);

  // Today's usage from agentConfig
  const configRows = await db
    .select()
    .from(agentConfig)
    .where(eq(agentConfig.id, "default"))
    .limit(1);
  const todayUsage = configRows[0]
    ? {
        tokensUsedToday: configRows[0].tokensUsedToday,
        dailyTokenBudget: configRows[0].dailyTokenBudget,
        tokenResetDate: configRows[0].tokenResetDate,
      }
    : { tokensUsedToday: 0, dailyTokenBudget: 100000, tokenResetDate: null };

  // Recent logs (last 50)
  const recentConditions = modeFilter !== "all"
    ? [eq(tokenUsageLogs.mode, modeFilter)]
    : [];

  const recentLogs = await db
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
    .where(recentConditions.length > 0 ? and(...recentConditions) : undefined)
    .orderBy(desc(tokenUsageLogs.createdAt))
    .limit(50);

  return json({ dailySummary, todayUsage, recentLogs });
}
