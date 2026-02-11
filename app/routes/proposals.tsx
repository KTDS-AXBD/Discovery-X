import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Outlet, useLoaderData, useParams } from "@remix-run/react";
import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "~/db";
import { proposals, proposalActions } from "~/features/proposals/db/schema";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { AppShell } from "~/components/layout/AppShell";
import { ProposalListSidebar } from "~/components/proposals/ProposalListSidebar";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return redirect("/login");
  }

  let proposalList: Array<{
    id: string;
    title: string;
    status: string;
    teamSize: number | null;
    updatedAt: Date | null;
    totalProgress: number;
  }> = [];

  try {
    const rawList = await db
      .select({
        id: proposals.id,
        title: proposals.title,
        status: proposals.status,
        teamSize: proposals.teamSize,
        updatedAt: proposals.updatedAt,
      })
      .from(proposals)
      .where(eq(proposals.tenantId, ctx.tenantId))
      .orderBy(desc(proposals.updatedAt));

    // Fetch action progress per proposal
    const progressMap = new Map<string, number>();
    if (rawList.length > 0) {
      const ids = rawList.map((p) => p.id);
      const progressRows = await db
        .select({
          proposalId: proposalActions.proposalId,
          total: sql<number>`count(*)`,
          completed: sql<number>`sum(case when ${proposalActions.completed} = 1 then 1 else 0 end)`,
        })
        .from(proposalActions)
        .where(sql`${proposalActions.proposalId} IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`)
        .groupBy(proposalActions.proposalId);

      for (const row of progressRows) {
        const pct = row.total > 0 ? Math.round(((row.completed ?? 0) / row.total) * 100) : 0;
        progressMap.set(row.proposalId, pct);
      }
    }

    proposalList = rawList.map((p) => ({
      ...p,
      totalProgress: progressMap.get(p.id) ?? 0,
    }));
  } catch {
    // Table might not exist yet
  }

  return json({ user: ctx.user, proposals: proposalList });
}

export default function ProposalsLayout() {
  const { user, proposals: proposalList } = useLoaderData<typeof loader>();
  const params = useParams();

  const serializedProposals = proposalList.map((p) => ({
    ...p,
    updatedAt: p.updatedAt ? String(p.updatedAt) : null,
  }));

  return (
    <AppShell
      user={user}
      sidebarContent={
        <ProposalListSidebar
          proposals={serializedProposals}
          activeId={params.id}
        />
      }
    >
      <Outlet />
    </AppShell>
  );
}
