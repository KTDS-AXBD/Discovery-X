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
import type { OnboardingState, DashboardCollectionItem, DashboardDiscoveryItem, DashboardProposalItem, DashboardAdapterItem, DashboardSourceStat } from "~/lib/services/dashboard.service";
import { SourceSidebar } from "~/components/dashboard/SourceSidebar";
import { SummaryCard } from "~/components/dashboard/SummaryCard";
import { PipelineKanban } from "~/components/dashboard/PipelineKanban";
import { StatisticsPanel } from "~/components/dashboard/StatisticsPanel";
import { OnboardingGuide } from "~/components/dashboard/OnboardingGuide";

const EMPTY_DATA = {
  recentCollections: { total: 0, items: [] as DashboardCollectionItem[] },
  totalDiscoveries: { total: 0, items: [] as DashboardDiscoveryItem[] },
  strategyProposals: { total: 0, items: [] as DashboardProposalItem[] },
  reactions: {} as Record<string, string | null>,
  viewedItemIds: [] as string[],
  timestamp: "",
  industryAdapterList: [] as DashboardAdapterItem[],
  sourceStats: [] as DashboardSourceStat[],
  serverNow: Date.now(),
  onboardingState: {
    step: 0 as const,
    firstDiscoveryId: null,
    firstDiscoveryStatus: null,
    hasExperiment: false,
    hasEvidence: false,
    hasClosed: false,
  },
};

export async function loader({ request, context }: LoaderFunctionArgs) {
  try {
    const db = getDb(context.cloudflare.env.DB);
    const secret = getSessionSecret(context.cloudflare.env);
    const ctx = await getSessionContext(request, db, secret);

    if (!ctx) return json(EMPTY_DATA);

    const now = new Date();
    const timestamp = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    const service = new DashboardService(db);
    const [data, onboardingState] = await Promise.all([
      service.getOverviewData({ tenantId: ctx.tenantId, userId: ctx.user?.id }),
      service.getOnboardingState(ctx.tenantId),
    ]);

    return json({ ...data, timestamp, onboardingState });
  } catch (error) {
    console.error("[dashboard._index.loader] Error:", error instanceof Error ? error.message : error);
    return json(EMPTY_DATA);
  }
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
    onboardingState,
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

  const typedOnboarding = onboardingState as OnboardingState;
  const showOnboarding = typedOnboarding.step < 4;

  return (
    <div className="space-y-4">
      {/* Onboarding Guide (step 0-3: 가이드, step 4: 축하 배너) */}
      <OnboardingGuide state={typedOnboarding} />

      {!showOnboarding && (
        <div className="flex h-[500px] gap-0 overflow-hidden rounded-lg border border-line">
          {/* Left: Source sidebar */}
          <SourceSidebar
            items={recentCollections.items}
            selectedItemId={selectedItemId}
            viewedItemIds={localViewed}
            onSelect={handleSelect}
          />

          {/* Right: Summary */}
          <div className="flex-1 overflow-hidden">
            <SummaryCard
              item={selectedItem}
              reaction={selectedItemId ? (reactions[selectedItemId] ?? null) : null}
            />
          </div>
        </div>
      )}

      {/* Pipeline Kanban */}
      <PipelineKanban
        discoveries={totalDiscoveries.items}
        proposals={strategyProposals.items}
      />

      {/* Statistics — 온보딩 중에는 숨김 */}
      {!showOnboarding && (
        <StatisticsPanel
          discoveries={totalDiscoveries.items}
          proposals={strategyProposals.items}
          industryAdapters={industryAdapterList}
          sourceStats={sourceStats}
          totalCollections={recentCollections.total}
          serverNow={serverNow}
        />
      )}
    </div>
  );
}
