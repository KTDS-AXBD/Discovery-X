/**
 * /dashboard (Overview) — 2-column layout: SourceSidebar + SummaryCard + PeerBriefing.
 */

import { useState } from "react";
import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useLoaderData } from "@remix-run/react";
import { eq, sql, desc, and, inArray } from "drizzle-orm";
import { getDb } from "~/db";
import { discoveries, radarItems, radarItemUserStatus } from "~/db/schema";
import { proposals } from "~/features/proposals/db/schema";
import { getSessionContext, getSessionSecret, getUserFromSession } from "~/lib/auth/session.server";
import { tenantWhere } from "~/lib/query/tenant-scope";
import { SourceSidebar } from "~/components/dashboard/SourceSidebar";
import { SummaryCard } from "~/components/dashboard/SummaryCard";
import { PeerBriefingSection } from "~/components/dashboard/PeerBriefingSection";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);
  const user = await getUserFromSession(request, db, secret);

  type CollectionItem = {
    id: string;
    title: string;
    summary: string | null;
    titleKo: string | null;
    summaryKo: string | null;
    keyPoints: string[] | null;
    url: string;
  };

  const emptyDefaults = {
    recentCollections: { total: 0, items: [] as CollectionItem[] },
    totalDiscoveries: { total: 0, items: [] as { id: string; title: string; status: string }[] },
    strategyProposals: { total: 0, items: [] as { id: string; title: string; status: string }[] },
    reactions: {} as Record<string, string | null>,
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

  // ── 4. Reactions (사용자별 반응) ───────────────────────────
  const reactions: Record<string, string | null> = {};
  if (user && recentCollections.items.length > 0) {
    try {
      const itemIds = recentCollections.items.map((i) => i.id);
      const statuses = await db
        .select({
          itemId: radarItemUserStatus.itemId,
          reaction: radarItemUserStatus.reaction,
        })
        .from(radarItemUserStatus)
        .where(
          and(
            eq(radarItemUserStatus.userId, user.id),
            inArray(radarItemUserStatus.itemId, itemIds),
          ),
        );

      for (const s of statuses) {
        reactions[s.itemId] = s.reaction ?? null;
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
    timestamp,
  });
}

export default function DashboardOverview() {
  const {
    recentCollections,
    totalDiscoveries,
    strategyProposals,
    reactions,
  } = useLoaderData<typeof loader>();

  const [selectedItemId, setSelectedItemId] = useState<string | null>(
    recentCollections.items[0]?.id ?? null,
  );

  const selectedItem = recentCollections.items.find(
    (item) => item.id === selectedItemId,
  ) ?? null;

  return (
    <div className="grid grid-cols-[280px_1fr] gap-4">
      {/* Left: Source sidebar */}
      <SourceSidebar
        items={recentCollections.items}
        selectedItemId={selectedItemId}
        onSelect={setSelectedItemId}
      />

      {/* Right: Summary + PeerBriefing */}
      <div className="space-y-4">
        <SummaryCard
          item={selectedItem}
          reaction={selectedItemId ? (reactions[selectedItemId] ?? null) : null}
        />

        <PeerBriefingSection
          ideas={totalDiscoveries.items}
          proposals={strategyProposals.items}
        />
      </div>
    </div>
  );
}
