/**
 * /dashboard (Overview) — Summary dashboard with status cards and statistics.
 */

import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useLoaderData } from "@remix-run/react";
import { eq, sql, desc } from "drizzle-orm";
import { getDb } from "~/db";
import { discoveries, radarItems, radarSources, industryAdapters } from "~/db/schema";
import { proposals } from "~/features/proposals/db/schema";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { tenantWhere } from "~/lib/query/tenant-scope";
import { PIPELINE_COLUMNS, STATUS_CONFIG } from "~/lib/constants/status";
import { StatusOverview } from "~/components/dashboard/StatusOverview";
import { StageDurationTable } from "~/components/dashboard/StageDurationTable";
import { DailyActivityChart } from "~/components/charts/DailyActivityChart";
import { IndustryDonut } from "~/components/charts/IndustryDonut";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/Card";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  const emptyDefaults = {
    recentCollections: { total: 0, items: [] as { id: string; title: string; summary: string | null }[] },
    totalDiscoveries: { total: 0, items: [] as { id: string; title: string; status: string }[] },
    strategyProposals: { total: 0, items: [] as { id: string; title: string; status: string }[] },
    totalSources: 0,
    dailyActivity: [] as { date: string; count: number }[],
    stageDuration: [] as { stage: string; label: string; avgWeeks: number }[],
    industryData: [] as { name: string; count: number; color: string }[],
    timestamp: "",
  };

  if (!ctx) return json(emptyDefaults);

  // ── Timestamp ──────────────────────────────────────────────
  const now = new Date();
  const timestamp = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  // ── 1. Recent collections (최근 수집) ──────────────────────
  let recentCollections = emptyDefaults.recentCollections;
  try {
    const tenantRunIds = sql`(SELECT id FROM radar_runs WHERE tenant_id = ${ctx.tenantId})`;

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(radarItems)
      .where(sql`${radarItems.runId} IN ${tenantRunIds}`);

    const latestItems = await db
      .select({
        id: radarItems.id,
        title: radarItems.title,
        summary: radarItems.summary,
      })
      .from(radarItems)
      .where(sql`${radarItems.runId} IN ${tenantRunIds}`)
      .orderBy(desc(sql`rowid`))
      .limit(10);

    recentCollections = {
      total: countResult[0]?.count ?? 0,
      items: latestItems,
    };
  } catch {
    // Radar tables might not exist in dev
  }

  // ── 2. All discoveries (전체 발굴) ─────────────────────────
  const allDiscoveries = await db
    .select({ id: discoveries.id, title: discoveries.title, status: discoveries.status })
    .from(discoveries)
    .where(tenantWhere(discoveries, ctx.tenantId));

  const totalDiscoveries = {
    total: allDiscoveries.length,
    items: allDiscoveries,
  };

  // ── 3. Strategy proposals (전략 건의) ──────────────────────
  let strategyProposals = emptyDefaults.strategyProposals;
  try {
    const allProposals = await db
      .select({ id: proposals.id, title: proposals.title, status: proposals.status })
      .from(proposals)
      .where(eq(proposals.tenantId, ctx.tenantId));

    strategyProposals = {
      total: allProposals.length,
      items: allProposals,
    };
  } catch {
    // proposals table might not exist
  }

  // ── 4. Source count (수집 소스) ─────────────────────────────
  let totalSources = 0;
  try {
    const sourceCountResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(radarSources)
      .where(eq(radarSources.tenantId, ctx.tenantId));
    totalSources = sourceCountResult[0]?.count ?? 0;
  } catch {
    // radarSources might not exist
  }

  // ── 5. Daily activity (일별 활동) ──────────────────────────
  const thirtyDaysAgo = Math.floor(Date.now() / 1000) - 30 * 24 * 3600;
  const dailyRows = await db
    .select({
      day: sql<string>`strftime('%m.%d', ${discoveries.createdAt}, 'unixepoch')`,
      count: sql<number>`count(*)`,
    })
    .from(discoveries)
    .where(
      tenantWhere(
        discoveries,
        ctx.tenantId,
        sql`${discoveries.createdAt} >= ${thirtyDaysAgo}`
      )
    )
    .groupBy(sql`strftime('%m.%d', ${discoveries.createdAt}, 'unixepoch')`)
    .orderBy(sql`strftime('%m.%d', ${discoveries.createdAt}, 'unixepoch')`);

  const dailyActivity = dailyRows.map((r) => ({ date: r.day, count: r.count }));

  // ── 6. Stage duration (단계별 체류시간) ────────────────────
  const nowUnix = Math.floor(Date.now() / 1000);
  const stageDuration: { stage: string; label: string; avgWeeks: number }[] = [];

  for (const col of PIPELINE_COLUMNS) {
    const config = STATUS_CONFIG[col.status];
    if (!config) continue;
    // Skip terminal stages
    if (config.category === "terminal") continue;

    const result = await db
      .select({
        avgWeeks: sql<number>`ROUND(AVG((${nowUnix} - ${discoveries.createdAt}) / (7.0 * 24 * 3600)), 1)`,
      })
      .from(discoveries)
      .where(
        tenantWhere(
          discoveries,
          ctx.tenantId,
          eq(discoveries.status, col.status)
        )
      );

    const avgWeeks = result[0]?.avgWeeks ?? 0;
    stageDuration.push({
      stage: col.status,
      label: config.label,
      avgWeeks,
    });
  }

  // ── 7. Industry distribution (산업 분포) ───────────────────
  const industryRows = await db
    .select({
      industryAdapterId: discoveries.industryAdapterId,
      nameKo: industryAdapters.nameKo,
      color: industryAdapters.color,
      count: sql<number>`count(*)`,
    })
    .from(discoveries)
    .leftJoin(industryAdapters, eq(discoveries.industryAdapterId, industryAdapters.id))
    .where(tenantWhere(discoveries, ctx.tenantId))
    .groupBy(discoveries.industryAdapterId);

  const industryData = industryRows.map((r) => ({
    name: r.nameKo ?? "미분류",
    count: r.count,
    color: r.color ?? "#9CA3AF",
  }));

  return json({
    recentCollections,
    totalDiscoveries,
    strategyProposals,
    totalSources,
    dailyActivity,
    stageDuration,
    industryData,
    timestamp,
  });
}

export default function DashboardOverview() {
  const {
    recentCollections,
    totalDiscoveries,
    strategyProposals,
    totalSources,
    dailyActivity,
    stageDuration,
    industryData,
    timestamp,
  } = useLoaderData<typeof loader>();

  return (
    <div>
      {/* 현황 섹션 */}
      <StatusOverview
        recentCollections={recentCollections}
        totalDiscoveries={totalDiscoveries}
        strategyProposals={strategyProposals}
        totalSources={totalSources}
        timestamp={timestamp}
      />

      {/* 통계 섹션 */}
      <div className="mt-8">
        <h2 className="mb-4 text-lg font-semibold text-[var(--axis-text-primary)]">통계</h2>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* 일별 활동 현황 */}
          <Card>
            <CardHeader>
              <CardTitle>일별 활동 현황</CardTitle>
            </CardHeader>
            <CardContent>
              <DailyActivityChart data={dailyActivity} />
            </CardContent>
          </Card>

          {/* 단계별 평균 체류 시간 */}
          <Card>
            <CardHeader>
              <CardTitle>단계별 평균 체류 시간</CardTitle>
            </CardHeader>
            <CardContent>
              <StageDurationTable data={stageDuration} />
            </CardContent>
          </Card>

          {/* 산업 분포 */}
          <Card>
            <CardHeader>
              <CardTitle>산업 분포</CardTitle>
            </CardHeader>
            <CardContent>
              <IndustryDonut data={industryData} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
