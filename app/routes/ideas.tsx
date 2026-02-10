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
import { formatDateLocalTime } from "~/lib/format-date";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return redirect("/login");
  }

  // Fetch radar items as "ideas"
  const tenantRunIds = sql`(SELECT id FROM radar_runs WHERE tenant_id = ${ctx.tenantId})`;
  let items: Array<{
    id: string;
    title: string;
    titleKo: string | null;
    summaryKo: string | null;
    url: string;
    relevanceScore: number | null;
    status: string;
    collectedAt: Date | string | null;
  }> = [];

  try {
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
      })
      .from(radarItems)
      .where(sql`${radarItems.runId} IN ${tenantRunIds}`)
      .orderBy(desc(radarItems.collectedAt))
      .limit(100);
  } catch {
    // Radar tables might not exist
  }

  return json({ user: ctx.user, items });
}

export default function IdeasLayout() {
  const { user, items } = useLoaderData<typeof loader>();
  const params = useParams();
  const selectedId = params.id;

  const contextPanel = <MemoPanel itemId={selectedId} />;

  return (
    <AppShell user={user} contextPanel={contextPanel}>
      <div className="flex h-full">
        {/* Ideas list (left area within surface) */}
        <div className="w-72 shrink-0 overflow-y-auto border-r border-[var(--dx-border-subtle,var(--axis-border-default))] bg-[var(--dx-surface-panel,var(--axis-surface-default))]">
          <div className="px-3 py-3">
            <h2 className="text-sm font-semibold text-[var(--axis-text-primary)]">
              아이디어 ({items.length})
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
                <p className="text-sm font-medium text-[var(--axis-text-primary)] line-clamp-2">
                  {item.titleKo || item.title}
                </p>
                <div className="mt-1 flex items-center gap-2 text-[10px] text-[var(--axis-text-tertiary)]">
                  {item.relevanceScore !== null && (
                    <span className={item.relevanceScore >= 60 ? "text-[var(--axis-text-brand)]" : ""}>
                      {item.relevanceScore}점
                    </span>
                  )}
                  <span>{item.status}</span>
                  {item.collectedAt && (
                    <span>{formatDateLocalTime(item.collectedAt)}</span>
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
