import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Outlet, useLoaderData, useParams } from "@remix-run/react";
import { desc, sql } from "drizzle-orm";
import { getDb } from "~/db";
import { radarItems } from "~/db/schema";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { AppShell } from "~/components/layout/AppShell";
import { MemoPanel } from "~/components/ideas/MemoPanel";
import { Link } from "@remix-run/react";
import { cn } from "~/lib/utils/cn";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return redirect("/login");
  }

  const url = new URL(request.url);
  const scoreMin = Number(url.searchParams.get("score") || "0");
  const statusFilter = url.searchParams.get("status") || "ALL";
  const searchQuery = url.searchParams.get("q") || "";

  // Tenant scoping
  const tenantRunIds = sql`(SELECT id FROM radar_runs WHERE tenant_id = ${ctx.tenantId})`;

  // Total count (unfiltered, for display)
  let totalCount = 0;
  let items: Array<{
    id: string;
    title: string;
    titleKo: string | null;
    summaryKo: string | null;
    url: string;
    relevanceScore: number | null;
    status: string;
    collectedAt: Date | string | null;
    memo: string | null;
  }> = [];

  try {
    // Total count query
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(radarItems)
      .where(sql`${radarItems.runId} IN ${tenantRunIds}`);
    totalCount = countResult[0]?.count ?? 0;

    // Dynamic WHERE conditions
    const conditions = [sql`${radarItems.runId} IN ${tenantRunIds}`];

    if (scoreMin > 0) {
      conditions.push(sql`${radarItems.relevanceScore} >= ${scoreMin}`);
    }

    if (statusFilter !== "ALL") {
      conditions.push(sql`${radarItems.status} = ${statusFilter}`);
    }

    if (searchQuery.trim()) {
      const like = `%${searchQuery.trim()}%`;
      conditions.push(
        sql`(${radarItems.titleKo} LIKE ${like} OR ${radarItems.title} LIKE ${like} OR ${radarItems.summaryKo} LIKE ${like})`
      );
    }

    items = await db
      .select({
        id: radarItems.id,
        title: radarItems.title,
        titleKo: radarItems.titleKo,
        summaryKo: radarItems.summaryKo,
        url: radarItems.url,
        relevanceScore: radarItems.relevanceScore,
        status: radarItems.status,
        collectedAt: radarItems.collectedAt,
        memo: radarItems.memo,
      })
      .from(radarItems)
      .where(sql.join(conditions, sql` AND `))
      .orderBy(desc(radarItems.collectedAt))
      .limit(100);
  } catch {
    // Radar tables might not exist
  }

  return json({ user: ctx.user, items, totalCount });
}

export default function IdeasLayout() {
  const { user, items } = useLoaderData<typeof loader>();
  const params = useParams();
  const selectedId = params.id;

  // Find selected item's memo for MemoPanel
  const selectedItem = selectedId ? items.find((i) => i.id === selectedId) : undefined;
  const contextPanel = (
    <MemoPanel itemId={selectedId} initialMemo={selectedItem?.memo} />
  );

  return (
    <AppShell user={user} contextPanel={contextPanel}>
      <div className="flex h-full">
        {/* Ideas list (left area within surface) */}
        <div className="w-72 shrink-0 overflow-y-auto border-r border-[var(--dx-border-subtle,var(--axis-border-default))] bg-[var(--dx-surface-panel,var(--axis-surface-default))]">
          <div className="px-3 py-3">
            <h2 className="text-sm font-semibold text-[var(--axis-text-primary)]">
              아이디어
            </h2>
          </div>
          <div className="px-2 pb-3 space-y-0.5">
            {items.map((item) => (
              <Link
                key={item.id}
                to={`/ideas/${item.id}`}
                className={cn(
                  "block rounded-lg px-3 py-2.5 transition-colors",
                  selectedId === item.id
                    ? "bg-[var(--dx-surface-card,var(--axis-surface-brand))]"
                    : "hover:bg-[var(--dx-surface-card-hover,var(--axis-surface-secondary))]"
                )}
              >
                <div className="flex items-start gap-1.5">
                  <p className="flex-1 text-sm font-medium text-[var(--axis-text-primary)] line-clamp-2">
                    {item.titleKo || item.title}
                  </p>
                  {item.memo && (
                    <span
                      className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--axis-text-brand)]"
                      title="메모 있음"
                    />
                  )}
                </div>
              </Link>
            ))}
            {items.length === 0 && (
              <p className="px-3 py-8 text-center text-sm text-[var(--axis-text-tertiary)]">
                수집된 아이디어가 없습니다.
              </p>
            )}
          </div>
        </div>

        {/* Detail area */}
        <div className="flex-1 overflow-y-auto">
          <Outlet />
        </div>
      </div>
    </AppShell>
  );
}
