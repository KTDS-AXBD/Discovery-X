/**
 * /dashboard/metrics — Metrics view with Agent stats.
 */

import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useLoaderData } from "@remix-run/react";
import { getDb } from "~/db";
import { discoveries, experiments, evidence, agentConfig } from "~/db/schema";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { tenantWhere } from "~/lib/query/tenant-scope";
import { eq, inArray } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/Card";
import { Badge } from "~/components/ui/Badge";
import { StatusBadge } from "~/components/ui/StatusBadge";
import { MetricCard } from "~/components/dashboard/MetricCard";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);
  if (!ctx) return json({ metrics: null });

  const allDiscoveries = await db.select().from(discoveries)
    .where(tenantWhere(discoveries, ctx.tenantId));
  const discoveryIds = allDiscoveries.map(d => d.id);
  const allExperiments = discoveryIds.length > 0
    ? await db.select().from(experiments).where(inArray(experiments.discoveryId, discoveryIds))
    : [];
  const allEvidence = discoveryIds.length > 0
    ? await db.select().from(evidence).where(inArray(evidence.discoveryId, discoveryIds))
    : [];

  const statusCounts: Record<string, number> = {};
  for (const d of allDiscoveries) {
    statusCounts[d.status] = (statusCounts[d.status] || 0) + 1;
  }

  const agentCreated = allDiscoveries.filter((d) => d.createdByAgent).length;
  const completedExperiments = allExperiments.filter((e) => e.completedAt).length;
  const strongEvidence = allEvidence.filter(
    (e) => e.strength === "A" || e.strength === "B"
  ).length;

  // Trend: compare current week vs previous week
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const thisWeekDiscoveries = allDiscoveries.filter((d) => d.createdAt && d.createdAt >= sevenDaysAgo).length;
  const prevWeekDiscoveries = allDiscoveries.filter(
    (d) => d.createdAt && d.createdAt >= fourteenDaysAgo && d.createdAt < sevenDaysAgo
  ).length;

  const thisWeekAgent = allDiscoveries.filter(
    (d) => d.createdByAgent && d.createdAt && d.createdAt >= sevenDaysAgo
  ).length;
  const prevWeekAgent = allDiscoveries.filter(
    (d) => d.createdByAgent && d.createdAt && d.createdAt >= fourteenDaysAgo && d.createdAt < sevenDaysAgo
  ).length;

  const thisWeekExperiments = allExperiments.filter(
    (e) => e.completedAt && e.completedAt >= sevenDaysAgo
  ).length;
  const prevWeekExperiments = allExperiments.filter(
    (e) => e.completedAt && e.completedAt >= fourteenDaysAgo && e.completedAt < sevenDaysAgo
  ).length;

  const thisWeekEvidence = allEvidence.filter(
    (e) => (e.strength === "A" || e.strength === "B") && e.createdAt && e.createdAt >= sevenDaysAgo
  ).length;
  const prevWeekEvidence = allEvidence.filter(
    (e) =>
      (e.strength === "A" || e.strength === "B") &&
      e.createdAt && e.createdAt >= fourteenDaysAgo &&
      e.createdAt < sevenDaysAgo
  ).length;

  // Agent token usage
  const config = await db
    .select()
    .from(agentConfig)
    .where(eq(agentConfig.id, "default"))
    .limit(1);

  return json({
    metrics: {
      total: allDiscoveries.length,
      statusCounts,
      agentCreated,
      humanCreated: allDiscoveries.length - agentCreated,
      totalExperiments: allExperiments.length,
      completedExperiments,
      totalEvidence: allEvidence.length,
      strongEvidence,
      agentTokensToday: config[0]?.tokensUsedToday || 0,
      agentTokenBudget: config[0]?.dailyTokenBudget || 100000,
      trends: {
        discovery: thisWeekDiscoveries - prevWeekDiscoveries,
        agent: thisWeekAgent - prevWeekAgent,
        experiments: thisWeekExperiments - prevWeekExperiments,
        evidence: thisWeekEvidence - prevWeekEvidence,
      },
    },
  });
}

export default function DashboardMetrics() {
  const { metrics } = useLoaderData<typeof loader>();

  if (!metrics) return null;

  const tokenUsagePercent = Math.round(
    (metrics.agentTokensToday / metrics.agentTokenBudget) * 100
  );

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold text-[var(--axis-text-primary)]">
        지표
      </h2>

      {/* Discovery Stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <MetricCard
          label="전체 Discovery"
          value={metrics.total}
          accentColor="var(--axis-chart-bar)"
          trend={{ delta: metrics.trends.discovery, label: "vs 지난주" }}
          delay={0}
        />
        <MetricCard
          label="Agent 생성"
          value={metrics.agentCreated}
          subtext={metrics.total > 0 ? `${Math.round((metrics.agentCreated / metrics.total) * 100)}%` : "0%"}
          accentColor="var(--axis-badge-purple-text)"
          trend={{ delta: metrics.trends.agent, label: "vs 지난주" }}
          delay={80}
        />
        <MetricCard
          label="실험"
          value={`${metrics.completedExperiments}/${metrics.totalExperiments}`}
          subtext="완료/전체"
          accentColor="var(--axis-chart-open)"
          trend={{ delta: metrics.trends.experiments, label: "vs 지난주" }}
          delay={160}
        />
        <MetricCard
          label="강한 근거 (A/B)"
          value={metrics.strongEvidence}
          subtext={`전체 ${metrics.totalEvidence}건 중`}
          accentColor="var(--axis-badge-success-text)"
          trend={{ delta: metrics.trends.evidence, label: "vs 지난주" }}
          delay={240}
        />
      </div>

      {/* Status Breakdown */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">상태별 분포</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {Object.entries(metrics.statusCounts).map(([status, count]) => (
              <div key={status} className="flex items-center gap-2">
                <StatusBadge status={status} />
                <span className="text-sm font-medium text-[var(--axis-text-primary)]">
                  {count as number}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Agent Token Usage */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Agent 토큰 사용량 (오늘)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="h-3 rounded-full bg-[var(--axis-surface-tertiary)]">
                <div
                  className="h-3 rounded-full bg-[var(--axis-button-bg-default)] transition-all"
                  style={{ width: `${Math.min(tokenUsagePercent, 100)}%` }}
                />
              </div>
            </div>
            <span className="text-sm font-medium text-[var(--axis-text-primary)]">
              {metrics.agentTokensToday.toLocaleString()} / {metrics.agentTokenBudget.toLocaleString()}
            </span>
            <Badge
              variant={tokenUsagePercent > 80 ? "destructive" : tokenUsagePercent > 50 ? "warning" : "success"}
            >
              {tokenUsagePercent}%
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
