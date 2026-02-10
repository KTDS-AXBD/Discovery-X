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
import { IndustryDonut } from "~/components/charts/IndustryDonut";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  const emptyDefaults = {
    recentCollections: { total: 0, items: [] as { id: string; title: string; summary: string | null }[] },
    totalDiscoveries: { total: 0, items: [] as { id: string; title: string; status: string }[] },
    strategyProposals: { total: 0, items: [] as { id: string; title: string; status: string }[] },
    totalSources: 0,
    stageDuration: [] as { stage: string; label: string; count: number }[],
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

  return json({
    recentCollections,
    totalDiscoveries,
    strategyProposals,
    totalSources,
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
    stageDuration,
    industryData,
    timestamp,
  } = useLoaderData<typeof loader>();

  // Compute total for industry percentage
  const industryTotal = industryData.reduce((sum, d) => sum + d.count, 0);

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

      {/* 데이터 분류 섹션 */}
      <div className="mt-8">
        <h2 className="mb-4 text-lg font-semibold text-[var(--axis-text-primary)]">데이터 분류</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--axis-border-default)]">
                <th className="pb-2 text-left text-xs font-medium text-[var(--axis-text-tertiary)]">
                  카테고리
                </th>
                <th className="pb-2 text-right text-xs font-medium text-[var(--axis-text-tertiary)] w-20">
                  건수
                </th>
                <th className="pb-2 text-right text-xs font-medium text-[var(--axis-text-tertiary)] w-20">
                  비율
                </th>
              </tr>
            </thead>
            <tbody>
              {industryData.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-4 text-center text-xs text-[var(--axis-text-tertiary)]">
                    데이터 없음
                  </td>
                </tr>
              ) : (
                industryData.map((row) => {
                  const pct = industryTotal > 0 ? ((row.count / industryTotal) * 100).toFixed(1) : "0.0";
                  return (
                    <tr
                      key={row.name}
                      className="border-b border-[var(--axis-border-default)] last:border-b-0"
                    >
                      <td className="py-2 text-[var(--axis-text-primary)]">
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: row.color }}
                          />
                          {row.name}
                        </span>
                      </td>
                      <td className="py-2 text-right tabular-nums text-[var(--axis-text-secondary)]">
                        {row.count}건
                      </td>
                      <td className="py-2 text-right tabular-nums text-[var(--axis-text-tertiary)]">
                        {pct}%
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 통계 섹션 */}
      <div className="mt-8">
        <h2 className="mb-4 text-lg font-semibold text-[var(--axis-text-primary)]">통계</h2>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* 단계별 건수 */}
          <div>
            <h3 className="mb-3 text-sm font-semibold text-[var(--axis-text-primary)]">단계별 건수</h3>
            <StageDurationTable data={stageDuration} />
          </div>

          {/* 산업 분포 */}
          <div>
            <h3 className="mb-3 text-sm font-semibold text-[var(--axis-text-primary)]">산업 분포</h3>
            <IndustryDonut data={industryData} />
          </div>
        </div>
      </div>
    </div>
  );
}
