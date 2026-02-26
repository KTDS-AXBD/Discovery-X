/**
 * /dashboard (Overview) — 2-column layout: SourceSidebar + SummaryCard + PeerBriefing.
 */

import { useState, useCallback } from "react";
import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { getDb } from "~/db";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { DashboardService } from "~/lib/services";
import { SourceSidebar } from "~/components/dashboard/SourceSidebar";
import { SummaryCard } from "~/components/dashboard/SummaryCard";
import { PipelineKanban } from "~/components/dashboard/PipelineKanban";
import { StatisticsPanel } from "~/components/dashboard/StatisticsPanel";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return json({
      recentCollections: { total: 0, items: [] },
      totalDiscoveries: { total: 0, items: [] },
      strategyProposals: { total: 0, items: [] },
      reactions: {} as Record<string, string | null>,
      viewedItemIds: [] as string[],
      timestamp: "",
      industryAdapterList: [],
      sourceStats: [],
      serverNow: Date.now(),
    });
  }

  const now = new Date();
  const timestamp = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  const service = new DashboardService(db);
  const data = await service.getOverviewData({
    tenantId: ctx.tenantId,
    userId: ctx.user?.id,
  });

  return json({ ...data, timestamp });
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
