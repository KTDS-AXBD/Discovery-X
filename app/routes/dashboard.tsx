import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Link, Outlet, useLoaderData, useLocation } from "@remix-run/react";
import { eq, sql } from "drizzle-orm";
import { getDb } from "~/db";
import { radarItems, radarSources } from "~/db/schema";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";
import { getSessionContext } from "~/lib/auth/session.server";
import { AppShell } from "~/components/layout/AppShell";
import { CollectionStatusPanel } from "~/components/dashboard/CollectionStatusPanel";
import { cn } from "~/lib/utils/cn";

export async function loader({ request, context }: LoaderFunctionArgs) {
  try {
    const db = getDb(context.cloudflare.env.DB);
    const secret = getSessionSecret(context.cloudflare.env);
    const user = await getUserFromSession(request, db, secret);

    if (!user) {
      return redirect("/login");
    }

    // Get session context for tenant-scoped queries
    const ctx = await getSessionContext(request, db, secret);
    let totalCollected = 0;
    let totalExplored = 0;
    const sourceCounts: { label: string; count: number; color: string }[] = [];

    if (ctx) {
      // Count radar items by source type
      try {
        const tenantRunIds = sql`(SELECT id FROM radar_runs WHERE tenant_id = ${ctx.tenantId})`;
        const itemCountResult = await db
          .select({ count: sql<number>`count(*)` })
          .from(radarItems)
          .where(sql`${radarItems.runId} IN ${tenantRunIds}`);
        totalCollected = itemCountResult[0]?.count ?? 0;

        // Count sources
        const sourceCountResult = await db
          .select({ count: sql<number>`count(*)` })
          .from(radarSources)
          .where(eq(radarSources.tenantId, ctx.tenantId));
        totalExplored = sourceCountResult[0]?.count ?? 0;

        // Source type breakdown
        const sourceTypes = await db
          .select({
            sourceType: radarSources.sourceType,
            count: sql<number>`count(*)`,
          })
          .from(radarSources)
          .where(eq(radarSources.tenantId, ctx.tenantId))
          .groupBy(radarSources.sourceType);

        const colors: Record<string, string> = {
          rss: "#3B82F6",
          web: "#10B981",
          youtube: "#EF4444",
        };
        const labels: Record<string, string> = {
          rss: "RSS",
          web: "Web",
          youtube: "YouTube",
        };

        for (const st of sourceTypes) {
          sourceCounts.push({
            label: labels[st.sourceType] || st.sourceType,
            count: st.count,
            color: colors[st.sourceType] || "#6B7280",
          });
        }
      } catch {
        // Radar tables might not exist yet
      }
    }

    return json({ user, totalCollected, totalExplored, sourceCounts });
  } catch (error) {
    console.error("[dashboard.loader] Error:", error instanceof Error ? error.message : error);
    return redirect("/login");
  }
}

const tabs = [
  { to: "/dashboard", label: "파이프라인", end: true },
  { to: "/dashboard/metrics", label: "지표" },
  { to: "/dashboard/health", label: "건강도" },
  { to: "/dashboard/alerts", label: "알림" },
  { to: "/dashboard/audit-log", label: "활동 기록", end: true },
  { to: "/dashboard/review", label: "주간 리뷰", end: true },
  { to: "/dashboard/recall", label: "리콜 큐", end: true },
  { to: "/dashboard/assets", label: "지식 자산", end: true },
  { to: "/dashboard/shadow", label: "Shadow", end: true },
];

export default function DashboardLayout() {
  const { user, totalCollected, totalExplored, sourceCounts } = useLoaderData<typeof loader>();
  const location = useLocation();

  const contextPanel = (
    <CollectionStatusPanel
      totalCollected={totalCollected}
      totalExplored={totalExplored}
      sources={sourceCounts}
    />
  );

  return (
    <AppShell user={user} contextPanel={contextPanel}>
      <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8">
        {/* Tab navigation */}
        <div className="mb-6 flex gap-4 overflow-x-auto border-b border-[var(--dx-border-subtle,var(--axis-border-default))]" role="tablist">
          {tabs.map((tab) => {
            const isActive = tab.end
              ? location.pathname === tab.to
              : location.pathname.startsWith(tab.to);
            return (
              <Link
                key={tab.to}
                to={tab.to}
                role="tab"
                aria-selected={isActive}
                className={cn(
                  "whitespace-nowrap pb-3 text-sm font-medium transition-colors duration-[var(--dx-transition-normal)]",
                  isActive
                    ? "text-[var(--axis-text-primary)] font-semibold border-b-2 border-[var(--axis-text-brand)]"
                    : "text-[var(--axis-text-tertiary)] hover:text-[var(--axis-text-primary)]"
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
        <Outlet />
      </div>
    </AppShell>
  );
}
