/**
 * GET /api/admin/usage-aggregates — Daily usage aggregates (ADMIN only)
 * Query params: range=7d|30d|90d (default 30d), groupBy=provider|purpose|model (default provider),
 *   userId (optional filter)
 */

import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { eq, and, desc, sql, gte } from "drizzle-orm";
import { getDb } from "~/db";
import { requireAdmin, getSessionSecret } from "~/lib/auth/session.server";
import { dailyUsageAggregates } from "~/features/cost/db/schema";

type RangeParam = "7d" | "30d" | "90d";
type GroupByParam = "provider" | "purpose" | "model";

function parseDays(range: RangeParam): number {
  switch (range) {
    case "90d":
      return 90;
    case "7d":
      return 7;
    default:
      return 30;
  }
}

function getGroupByColumn(groupBy: GroupByParam) {
  switch (groupBy) {
    case "purpose":
      return dailyUsageAggregates.purpose;
    case "model":
      return dailyUsageAggregates.model;
    default:
      return dailyUsageAggregates.provider;
  }
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  try {
    const db = getDb(context.cloudflare.env.DB);
    const secret = getSessionSecret(context.cloudflare.env);
    await requireAdmin(request, db, secret);

    const url = new URL(request.url);
    const range = (url.searchParams.get("range") || "30d") as RangeParam;
    const groupBy = (url.searchParams.get("groupBy") || "provider") as GroupByParam;
    const userId = url.searchParams.get("userId");

    const days = parseDays(range);
    const startDate = new Date(Date.now() - days * 86400_000);
    const startDateStr = startDate.toISOString().split("T")[0];

    const groupByCol = getGroupByColumn(groupBy);

    // Build conditions
    const conditions = [gte(dailyUsageAggregates.date, startDateStr)];
    if (userId) {
      conditions.push(eq(dailyUsageAggregates.userId, userId));
    }

    const whereClause = and(...conditions);

    // Aggregates grouped by date + groupBy dimension
    const aggregateRows = await db
      .select({
        date: dailyUsageAggregates.date,
        key: sql<string>`coalesce(${groupByCol}, 'unknown')`.as("key"),
        requests: sql<number>`sum(${dailyUsageAggregates.requestCount})`.as("requests"),
        tokens: sql<number>`sum(${dailyUsageAggregates.totalTokens})`.as("tokens"),
        costUsd: sql<number>`sum(${dailyUsageAggregates.totalCostUsd})`.as("cost_usd"),
      })
      .from(dailyUsageAggregates)
      .where(whereClause)
      .groupBy(dailyUsageAggregates.date, groupByCol)
      .orderBy(dailyUsageAggregates.date, desc(sql`sum(${dailyUsageAggregates.totalCostUsd})`));

    // Summary totals
    const totalRequests = aggregateRows.reduce((s, r) => s + (r.requests ?? 0), 0);
    const totalTokens = aggregateRows.reduce((s, r) => s + (r.tokens ?? 0), 0);
    const totalCostUsd = aggregateRows.reduce((s, r) => s + (r.costUsd ?? 0), 0);

    return Response.json({
      aggregates: aggregateRows,
      summary: { totalRequests, totalTokens, totalCostUsd },
    });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.admin.usage-aggregates] error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
