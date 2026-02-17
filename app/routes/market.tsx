import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Outlet, useLoaderData, useParams, useNavigate } from "@remix-run/react";
import { desc, sql } from "drizzle-orm";
import { getDb } from "~/db";
import { radarItems } from "~/db/schema";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { AppShell } from "~/components/layout/AppShell";
import { MarketSidebar } from "~/components/market/MarketSidebar";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);
  if (!ctx) return redirect("/login");

  const items = await db
    .select({
      id: radarItems.id,
      title: radarItems.title,
      titleKo: radarItems.titleKo,
      summaryKo: radarItems.summaryKo,
      relevanceScore: radarItems.relevanceScore,
      status: radarItems.status,
    })
    .from(radarItems)
    .where(sql`${radarItems.runId} IN (SELECT id FROM radar_runs WHERE tenant_id = ${ctx.tenantId})`)
    .orderBy(desc(sql`rowid`))
    .limit(100);

  return json({ user: ctx.user, items });
}

export default function MarketLayout() {
  const { user, items } = useLoaderData<typeof loader>();
  const params = useParams();
  const navigate = useNavigate();
  const activeItemId = params.id || null;

  return (
    <AppShell user={user}>
      <div className="flex h-[calc(100vh-var(--dx-nav-height))] overflow-hidden">
        <MarketSidebar
          items={items}
          activeItemId={activeItemId}
          onSelectItem={(id) => navigate(`/market/${id}`)}
        />
        <div className="flex-1 overflow-y-auto">
          <Outlet />
        </div>
      </div>
    </AppShell>
  );
}
