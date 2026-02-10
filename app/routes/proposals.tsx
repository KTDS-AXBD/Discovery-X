import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Outlet, useLoaderData, useParams } from "@remix-run/react";
import { desc, eq } from "drizzle-orm";
import { getDb } from "~/db";
import { proposals } from "~/features/proposals/db/schema";
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
  }> = [];

  try {
    proposalList = await db
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
