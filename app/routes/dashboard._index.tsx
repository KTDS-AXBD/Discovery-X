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
import { PeerBriefingSection } from "~/components/dashboard/PeerBriefingSection";
import { StatisticsSection } from "~/components/dashboard/StatisticsSection";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  const emptyDefaults = {
    recentCollections: { total: 0, items: [] as { id: string; title: string; summary: string | null; titleKo: string | null; summaryKo: string | null; keyPoints: string[] | null; url: string }[] },
    totalDiscoveries: { total: 0, items: [] as { id: string; title: string; status: string }[] },
    strategyProposals: { total: 0, items: [] as { id: string; title: string; status: string }[] },
    totalSources: 0,
    stageDuration: [] as { stage: string; label: string; count: number }[],
    industryData: [] as { name: string; count: number; color: string }[],
    monthlyActivity: [] as { month: string; count: number }[],
    sourceBreakdown: { web: 0, youtube: 0, uncategorized: 0 },
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
        titleKo: radarItems.titleKo,
        summaryKo: radarItems.summaryKo,
        keyPoints: radarItems.keyPoints,
        url: radarItems.url,
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

  // ── 5. Stage duration — COUNT per stage (단계별 건수) ──────
  const stageDuration: { stage: string; label: string; count: number }[] = [];

  for (const col of PIPELINE_COLUMNS) {
    const config = STATUS_CONFIG[col.status];
    if (!config) continue;
    // Skip terminal stages
    if (config.category === "terminal") continue;

    const result = await db
      .select({
        count: sql<number>`count(*)`,
      })
      .from(discoveries)
      .where(
        tenantWhere(
          discoveries,
          ctx.tenantId,
          eq(discoveries.status, col.status)
        )
      );

    const count = result[0]?.count ?? 0;
    stageDuration.push({
      stage: col.status,
      label: config.label,
      count,
    });
  }

  // ── 6. Industry distribution (산업 분포) ───────────────────
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

  // ── 7. Monthly activity (월별 활동) ──────────────────────
  let monthlyActivity = emptyDefaults.monthlyActivity;
  try {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    const sinceTs = Math.floor(sixMonthsAgo.getTime() / 1000);

    const monthlyRows = await db
      .select({
        month: sql<string>`strftime('%y.%m', ${radarItems.collectedAt}, 'unixepoch')`,
        count: sql<number>`count(*)`,
      })
      .from(radarItems)
      .where(
        sql`${radarItems.runId} IN (SELECT id FROM radar_runs WHERE tenant_id = ${ctx.tenantId}) AND ${radarItems.collectedAt} >= ${sinceTs}`
      )
      .groupBy(sql`strftime('%y.%m', ${radarItems.collectedAt}, 'unixepoch')`)
      .orderBy(sql`strftime('%y.%m', ${radarItems.collectedAt}, 'unixepoch')`);

    monthlyActivity = monthlyRows.map((r) => ({
      month: r.month ?? "",
      count: r.count,
    }));
  } catch {
    // radarItems might not exist
  }

  // ── 8. Source breakdown (소스 타입 분류) ─────────────────
  let sourceBreakdown = emptyDefaults.sourceBreakdown;
  try {
    const allUrls = await db
      .select({ url: radarItems.url })
      .from(radarItems)
      .where(
        sql`${radarItems.runId} IN (SELECT id FROM radar_runs WHERE tenant_id = ${ctx.tenantId})`
      );

    let web = 0;
    let youtube = 0;
    let uncategorized = 0;
    for (const row of allUrls) {
      const u = (row.url ?? "").toLowerCase();
      if (u.includes("youtube.com") || u.includes("youtu.be")) youtube++;
      else if (u.startsWith("http")) web++;
      else uncategorized++;
    }
    sourceBreakdown = { web, youtube, uncategorized };
  } catch {
    // radarItems might not exist
  }

  return json({
    recentCollections,
    totalDiscoveries,
    strategyProposals,
    totalSources,
    stageDuration,
    industryData,
    monthlyActivity,
    sourceBreakdown,
    timestamp,
  });
}

export default function DashboardOverview() {
  const {
    recentCollections,
    totalDiscoveries,
    strategyProposals,
    totalSources,
    stageDuration,
    industryData,
    monthlyActivity,
    sourceBreakdown,
  } = useLoaderData<typeof loader>();

  return (
    <div>
      {/* 현황 섹션 */}
      <StatusOverview recentCollections={recentCollections} />

      {/* 피어브리핑 섹션 */}
      <PeerBriefingSection
        ideas={totalDiscoveries.items}
        proposals={strategyProposals.items}
      />

      {/* 통계 섹션 */}
      <StatisticsSection
        monthlyActivity={monthlyActivity}
        stageDuration={stageDuration}
        industryData={industryData}
        totalSources={totalSources}
        sourceBreakdown={sourceBreakdown}
      />
    </div>
  );
}
