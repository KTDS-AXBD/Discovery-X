/**
 * /dashboard/metrics — Metrics view with Agent stats.
 */

import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useLoaderData } from "@remix-run/react";
import { getDb } from "~/db";
import { discoveries, experiments, evidence, agentConfig } from "~/db/schema";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";
import { eq } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/Card";
import { Badge } from "~/components/ui/Badge";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const user = await getUserFromSession(request, db, secret);
  if (!user) return json({ metrics: null });

  const allDiscoveries = await db.select().from(discoveries);
  const allExperiments = await db.select().from(experiments);
  const allEvidence = await db.select().from(evidence);

  const statusCounts: Record<string, number> = {};
  for (const d of allDiscoveries) {
    statusCounts[d.status] = (statusCounts[d.status] || 0) + 1;
  }

  const agentCreated = allDiscoveries.filter((d) => d.createdByAgent).length;
  const completedExperiments = allExperiments.filter((e) => e.completedAt).length;
  const strongEvidence = allEvidence.filter(
    (e) => e.strength === "A" || e.strength === "B"
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
        Metrics
      </h2>

      {/* Discovery Stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-[var(--axis-text-tertiary)]">전체 Discovery</p>
            <p className="mt-1 text-2xl font-bold text-[var(--axis-text-primary)]">{metrics.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-[var(--axis-text-tertiary)]">Agent 생성</p>
            <p className="mt-1 text-2xl font-bold text-[var(--axis-text-brand)]">{metrics.agentCreated}</p>
            <p className="text-[10px] text-[var(--axis-text-tertiary)]">
              {metrics.total > 0
                ? `${Math.round((metrics.agentCreated / metrics.total) * 100)}%`
                : "0%"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-[var(--axis-text-tertiary)]">실험</p>
            <p className="mt-1 text-2xl font-bold text-[var(--axis-text-primary)]">
              {metrics.completedExperiments}/{metrics.totalExperiments}
            </p>
            <p className="text-[10px] text-[var(--axis-text-tertiary)]">완료/전체</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-[var(--axis-text-tertiary)]">강한 근거 (A/B)</p>
            <p className="mt-1 text-2xl font-bold text-[var(--axis-badge-success-text)]">
              {metrics.strongEvidence}
            </p>
            <p className="text-[10px] text-[var(--axis-text-tertiary)]">
              전체 {metrics.totalEvidence}건 중
            </p>
          </CardContent>
        </Card>
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
                <Badge
                  variant={
                    status === "INBOX"
                      ? "info"
                      : status === "OPEN"
                        ? "warning"
                        : status === "NEXT"
                          ? "success"
                          : status === "DEAD_END"
                            ? "destructive"
                            : status === "EXTENSION_REQUESTED"
                              ? "purple"
                              : "secondary"
                  }
                >
                  {status}
                </Badge>
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
