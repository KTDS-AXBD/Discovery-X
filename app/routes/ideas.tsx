import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Outlet, useLoaderData, useLocation } from "@remix-run/react";
import { getDb } from "~/db";
import { IdeaService, RadarService } from "~/lib/services";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { IdeaPageHeader } from "~/components/ideas/IdeaPageHeader";

export async function loader({ request, context }: LoaderFunctionArgs) {
  try {
    const db = getDb(context.cloudflare.env.DB);
    const secret = getSessionSecret(context.cloudflare.env);
    const ctx = await getSessionContext(request, db, secret);

    if (!ctx) {
      return redirect("/login");
    }

    const ideaService = new IdeaService(db);
    const radarService = new RadarService(db);

    let ideaList: Awaited<ReturnType<IdeaService["list"]>> = [];
    try {
      ideaList = await ideaService.list(ctx.tenantId);
    } catch {
      // ideas table might not exist yet
    }

    let allItems: Array<{
      id: string;
      title: string;
      titleKo: string | null;
      summaryKo: string | null;
      url: string;
      relevanceScore: number | null;
      status: string;
      collectedAt: number | string | null;
      memo: string | null;
    }> = [];
    try {
      const items = await radarService.listRecentItemsByTenant(ctx.tenantId, 100);
      allItems = items.map((item) => ({
        id: item.id,
        title: item.title,
        titleKo: item.titleKo,
        summaryKo: item.summaryKo,
        url: item.url,
        relevanceScore: item.relevanceScore,
        status: item.status,
        collectedAt: item.collectedAt instanceof Date ? item.collectedAt.getTime() : item.collectedAt,
        memo: item.memo,
      }));
    } catch {
      // Radar tables might not exist
    }

    return json({ user: ctx.user, ideaList, allItems });
  } catch (error) {
    console.error("[ideas.loader] Error:", error instanceof Error ? error.message : error);
    return redirect("/login");
  }
}

export default function IdeasLayout() {
  const { user, ideaList, allItems } = useLoaderData<typeof loader>();
  const location = useLocation();
  const isIndex = location.pathname === "/ideas" || location.pathname === "/ideas/";

  return (
    <div className="flex h-screen flex-col bg-surface-deep">
      <IdeaPageHeader
        user={user}
        showProposalButton={!isIndex}
      />
      <div className="flex-1 overflow-hidden">
        <Outlet context={{ user, ideaList, allItems }} />
      </div>
    </div>
  );
}
