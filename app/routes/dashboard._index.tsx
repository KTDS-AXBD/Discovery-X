/**
 * /dashboard (Overview) — 2-column layout: SourceSidebar + SummaryCard + PeerBriefing.
 */

import { useState, useCallback } from "react";
import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { eq, sql, desc, and, inArray } from "drizzle-orm";
import { getDb } from "~/db";
import { discoveries, radarItems, radarItemUserStatus, radarSources, industryAdapters } from "~/db/schema";
import { proposals } from "~/features/proposals/db/schema";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { tenantWhere } from "~/lib/query/tenant-scope";
import { SourceSidebar } from "~/components/dashboard/SourceSidebar";
import { SummaryCard } from "~/components/dashboard/SummaryCard";
import { PipelineKanban } from "~/components/dashboard/PipelineKanban";
import { StatisticsPanel } from "~/components/dashboard/StatisticsPanel";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  type CollectionItem = {
    id: string;
    title: string;
    summary: string | null;
    titleKo: string | null;
    summaryKo: string | null;
    keyPoints: string[] | null;
    url: string;
  };

  type DiscoveryItem = {
    id: string;
    title: string;
    status: string;
    createdAt: Date | null;
    stageUpdatedAt: Date | null;
    industryAdapterId: string | null;
  };
  type ProposalItem = {
    id: string;
    title: string;
    status: string;
    createdAt: Date | null;
    updatedAt: Date | null;
  };
  type SourceStat = { sourceType: string; count: number };
  type AdapterItem = { id: string; nameKo: string; color: string };

  const emptyDefaults = {
    recentCollections: { total: 0, items: [] as CollectionItem[] },
    totalDiscoveries: { total: 0, items: [] as DiscoveryItem[] },
    strategyProposals: { total: 0, items: [] as ProposalItem[] },
    reactions: {} as Record<string, string | null>,
    viewedItemIds: [] as string[],
    timestamp: "",
    industryAdapterList: [] as AdapterItem[],
    sourceStats: [] as SourceStat[],
    serverNow: Date.now(),
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
    .select({
      id: discoveries.id,
      title: discoveries.title,
      status: discoveries.status,
      createdAt: discoveries.createdAt,
      stageUpdatedAt: discoveries.stageUpdatedAt,
      industryAdapterId: discoveries.industryAdapterId,
    })
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
      .select({
        id: proposals.id,
        title: proposals.title,
        status: proposals.status,
        createdAt: proposals.createdAt,
        updatedAt: proposals.updatedAt,
      })
      .from(proposals)
      .where(eq(proposals.tenantId, ctx.tenantId));

    strategyProposals = {
      total: allProposals.length,
      items: allProposals,
    };
  } catch {
    // proposals table might not exist
  }

  // ── 3b. Industry adapters ─────────────────────────────────
  let industryAdapterList = emptyDefaults.industryAdapterList;
  try {
    industryAdapterList = await db
      .select({ id: industryAdapters.id, nameKo: industryAdapters.nameKo, color: industryAdapters.color })
      .from(industryAdapters)
      .where(tenantWhere(industryAdapters, ctx.tenantId));
  } catch {
    // industry_adapters table might not exist
  }

  // ── 3c. Source stats (소스 타입별 카운트) ──────────────────
  let sourceStats = emptyDefaults.sourceStats;
  try {
    sourceStats = await db
      .select({ sourceType: radarSources.sourceType, count: sql<number>`count(*)` })
      .from(radarSources)
      .where(tenantWhere(radarSources, ctx.tenantId))
      .groupBy(radarSources.sourceType);
  } catch {
    // radar_sources table might not exist
  }

  // ── 4. Reactions + Viewed status (사용자별 반응 + 읽음 상태) ─
  const reactions: Record<string, string | null> = {};
  const viewedItemIds: string[] = [];
  if (ctx?.user && recentCollections.items.length > 0) {
    try {
      const itemIds = recentCollections.items.map((i) => i.id);
      const statuses = await db
        .select({
          itemId: radarItemUserStatus.itemId,
          status: radarItemUserStatus.status,
          reaction: radarItemUserStatus.reaction,
        })
        .from(radarItemUserStatus)
        .where(
          and(
            eq(radarItemUserStatus.userId, ctx.user.id),
            inArray(radarItemUserStatus.itemId, itemIds),
          ),
        );

      for (const s of statuses) {
        reactions[s.itemId] = s.reaction ?? null;
        if (s.status === "viewed" || s.status === "archived") {
          viewedItemIds.push(s.itemId);
        }
      }
    } catch {
      // radarItemUserStatus might not have reaction column yet
    }
  }

  return json({
    recentCollections,
    totalDiscoveries,
    strategyProposals,
    reactions,
    viewedItemIds,
    timestamp,
    industryAdapterList,
    sourceStats,
    serverNow: Date.now(),
  });
}

export default function DashboardOverview() {
  const {
    recentCollections,
    totalDiscoveries,
    strategyProposals,
    reactions,
    viewedItemIds,
    industryAdapterList,
    sourceStats,
    serverNow,
  } = useLoaderData<typeof loader>();

  const [selectedItemId, setSelectedItemId] = useState<string | null>(
    recentCollections.items[0]?.id ?? null,
  );
  const [localViewed, setLocalViewed] = useState<Set<string>>(
    new Set(viewedItemIds),
  );
  const statusFetcher = useFetcher();

  const handleSelect = useCallback(
    (id: string) => {
      setSelectedItemId(id);
      if (!localViewed.has(id)) {
        setLocalViewed((prev) => new Set(prev).add(id));
        statusFetcher.submit(JSON.stringify({ status: "viewed" }), {
          method: "PATCH",
          action: `/api/radar/items/${id}/status`,
          encType: "application/json",
        });
      }
    },
    [localViewed, statusFetcher],
  );

  const selectedItem = recentCollections.items.find(
    (item) => item.id === selectedItemId,
  ) ?? null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[280px_1fr] gap-4">
        {/* Left: Source sidebar */}
        <SourceSidebar
          items={recentCollections.items}
          selectedItemId={selectedItemId}
          viewedItemIds={localViewed}
          onSelect={handleSelect}
        />

        {/* Right: Summary */}
        <SummaryCard
          item={selectedItem}
          reaction={selectedItemId ? (reactions[selectedItemId] ?? null) : null}
        />
      </div>

      {/* Pipeline Kanban */}
      <PipelineKanban
        discoveries={totalDiscoveries.items}
        proposals={strategyProposals.items}
      />

      {/* Statistics */}
      <StatisticsPanel
        discoveries={totalDiscoveries.items}
        proposals={strategyProposals.items}
        industryAdapters={industryAdapterList}
        sourceStats={sourceStats}
        totalCollections={recentCollections.total}
        serverNow={serverNow}
      />
    </div>
  );
}
