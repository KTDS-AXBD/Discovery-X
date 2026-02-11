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

    const latestItemsRaw = await db
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
      .limit(30);

    const META_RE = /^(댓글\s*\d+개|댓글\s*없음|\d+\s*(comments?|points?|개))$/i;
    const latestItems = latestItemsRaw
      .filter((item) => {
        const t = item.title?.trim() ?? "";
        const tKo = item.titleKo?.trim() ?? "";
        const best = tKo.length >= 5 && !META_RE.test(tKo) ? tKo : t;
        return best.length >= 5 && !META_RE.test(best) && /\s/.test(best);
      })
      .slice(0, 10);

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

  const kpiCards = [
    {
      label: "수집 아이템",
      value: recentCollections.total,
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
        </svg>
      ),
      accent: "var(--axis-chart-bar)",
    },
    {
      label: "발굴 아이디어",
      value: totalDiscoveries.total,
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
        </svg>
      ),
      accent: "var(--axis-button-success-bg-default)",
    },
    {
      label: "사업 제안",
      value: strategyProposals.total,
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5m.75-9 3-3 2.148 2.148A12.061 12.061 0 0 1 16.5 7.605" />
        </svg>
      ),
      accent: "var(--axis-button-purple-bg-default)",
    },
    {
      label: "수집 소스",
      value: totalSources,
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
        </svg>
      ),
      accent: "var(--axis-text-secondary)",
    },
  ];

  return (
    <div>
      {/* KPI 요약 카드 */}
      <div className="grid grid-cols-4 gap-4">
        {kpiCards.map((card) => (
          <div key={card.label} className="dx-panel p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--axis-text-tertiary)]">
                {card.label}
              </span>
              <span style={{ color: card.accent }}>{card.icon}</span>
            </div>
            <p className="mt-2 text-2xl font-bold tabular-nums text-[var(--axis-text-primary)]">
              {card.value.toLocaleString()}
            </p>
          </div>
        ))}
      </div>

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
