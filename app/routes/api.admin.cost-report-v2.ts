/**
 * GET /api/admin/cost-report-v2 — 3-Ledger cost report (ADMIN only)
 * Query params: range=7d|30d|90d (default 7d), groupBy=provider|purpose|model|user (default provider)
 */

import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { eq, desc, sql, gte } from "drizzle-orm";
import { getDb } from "~/db";
import { requireAdmin, getSessionSecret } from "~/lib/auth/session.server";
import {
  dailyUsageAggregates,
  budgetPolicies,
  budgetUsageCache,
} from "~/features/cost/db/schema";

type RangeParam = "7d" | "30d" | "90d";
type GroupByParam = "provider" | "purpose" | "model" | "user";

function parseDays(range: RangeParam): number {
  switch (range) {
    case "90d":
      return 90;
    case "30d":
      return 30;
    default:
      return 7;
  }
}

function getGroupByColumn(groupBy: GroupByParam) {
  switch (groupBy) {
    case "purpose":
      return dailyUsageAggregates.purpose;
    case "model":
      return dailyUsageAggregates.model;
    case "user":
      return dailyUsageAggregates.userId;
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
    const range = (url.searchParams.get("range") || "7d") as RangeParam;
    const groupBy = (url.searchParams.get("groupBy") || "provider") as GroupByParam;

    const days = parseDays(range);
    const startDate = new Date(Date.now() - days * 86400_000);
    const startDateStr = startDate.toISOString().split("T")[0];
    const endDateStr = new Date().toISOString().split("T")[0];

    const groupByCol = getGroupByColumn(groupBy);

    // 1. Breakdown by groupBy dimension
    const breakdownRows = await db
      .select({
        key: sql<string>`coalesce(${groupByCol}, 'unknown')`.as("key"),
        requests: sql<number>`sum(${dailyUsageAggregates.requestCount})`.as("requests"),
        tokens: sql<number>`sum(${dailyUsageAggregates.totalTokens})`.as("tokens"),
        costUsd: sql<number>`sum(${dailyUsageAggregates.totalCostUsd})`.as("cost_usd"),
      })
      .from(dailyUsageAggregates)
      .where(gte(dailyUsageAggregates.date, startDateStr))
      .groupBy(groupByCol)
      .orderBy(desc(sql`sum(${dailyUsageAggregates.totalCostUsd})`));

    // 2. Daily trend
    const dailyTrendRows = await db
      .select({
        date: dailyUsageAggregates.date,
        requests: sql<number>`sum(${dailyUsageAggregates.requestCount})`.as("requests"),
        tokens: sql<number>`sum(${dailyUsageAggregates.totalTokens})`.as("tokens"),
        costUsd: sql<number>`sum(${dailyUsageAggregates.totalCostUsd})`.as("cost_usd"),
      })
      .from(dailyUsageAggregates)
      .where(gte(dailyUsageAggregates.date, startDateStr))
      .groupBy(dailyUsageAggregates.date)
      .orderBy(dailyUsageAggregates.date);

    // 3. Summary totals
    const totalRequests = breakdownRows.reduce((s, r) => s + (r.requests ?? 0), 0);
    const totalTokens = breakdownRows.reduce((s, r) => s + (r.tokens ?? 0), 0);
    const totalCostUsd = breakdownRows.reduce((s, r) => s + (r.costUsd ?? 0), 0);

    // 4. Budget status: active policies + usage cache
    const budgetRows = await db
      .select({
        policy: budgetPolicies,
        cache: budgetUsageCache,
      })
      .from(budgetPolicies)
      .leftJoin(
        budgetUsageCache,
        eq(budgetUsageCache.budgetPolicyId, budgetPolicies.id),
      )
      .where(eq(budgetPolicies.isActive, true))
      .orderBy(desc(budgetPolicies.createdAt));

    const budgetStatus = budgetRows.map((row) => ({
      policy: row.policy,
      cache: row.cache ?? null,
    }));

    return Response.json({
      period: { startDate: startDateStr, endDate: endDateStr, days },
      summary: { totalRequests, totalTokens, totalCostUsd },
      breakdown: breakdownRows,
      dailyTrend: dailyTrendRows,
      budgetStatus,
    });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.admin.cost-report-v2] error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
