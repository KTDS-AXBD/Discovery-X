import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useLoaderData } from "@remix-run/react";
import { eq } from "drizzle-orm";
import { getDb } from "~/db";
import {
  proposals,
  proposalSections,
  proposalMilestones,
  proposalActions,
  proposalComments,
  proposalMembers,
} from "~/features/proposals/db/schema";
import { users } from "~/db/schema";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { ProposalDetail } from "~/components/proposals/ProposalDetail";
import { ProgressPanel } from "~/components/proposals/ProgressPanel";


export async function loader({ params, request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return redirect("/login");
  }

  const proposal = await db.select().from(proposals).where(eq(proposals.id, params.id!)).get();

  if (!proposal) {
    throw new Response("Not Found", { status: 404 });
  }

  if (proposal.tenantId !== ctx.tenantId) {
    throw new Response("Not Found", { status: 404 });
  }

  const [sections, milestones, actions, commentsRaw, membersRaw] = await Promise.all([
    db.select().from(proposalSections).where(eq(proposalSections.proposalId, params.id!)),
    db.select().from(proposalMilestones).where(eq(proposalMilestones.proposalId, params.id!)),
    db.select({
      id: proposalActions.id,
      title: proposalActions.title,
      assigneeId: proposalActions.assigneeId,
      completed: proposalActions.completed,
      dueDate: proposalActions.dueDate,
      createdAt: proposalActions.createdAt,
      assigneeName: users.name,
    })
    .from(proposalActions)
    .leftJoin(users, eq(proposalActions.assigneeId, users.id))
    .where(eq(proposalActions.proposalId, params.id!)),
    db.select({
      id: proposalComments.id,
      authorId: proposalComments.authorId,
      content: proposalComments.content,
      createdAt: proposalComments.createdAt,
      authorName: users.name,
    })
    .from(proposalComments)
    .leftJoin(users, eq(proposalComments.authorId, users.id))
    .where(eq(proposalComments.proposalId, params.id!)),
    db.select({
      userId: proposalMembers.userId,
      userName: users.name,
    })
    .from(proposalMembers)
    .leftJoin(users, eq(proposalMembers.userId, users.id))
    .where(eq(proposalMembers.proposalId, params.id!)),
  ]);

  // Calculate progress
  const completedActions = actions.filter((a) => a.completed).length;
  const totalProgress = actions.length > 0 ? Math.round((completedActions / actions.length) * 100) : 0;

  const memberNames = membersRaw.map((m) => m.userName).filter(Boolean) as string[];

  let daysRemaining: number | null = null;
  if (proposal.startDate) {
    const start = new Date(proposal.startDate);
    const end = new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days
    const now = new Date();
    daysRemaining = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
  }

  // Fetch tenant users for member management
  const tenantUsers = await db
    .select({ id: users.id, name: users.name })
    .from(users);

  return json({
    proposal,
    sections,
    milestones,
    actions,
    comments: commentsRaw,
    totalProgress,
    daysRemaining,
    currentUserId: ctx.user.id,
    isOwner: proposal.ownerId === ctx.user.id,
    memberNames,
    members: membersRaw,
    tenantUsers,
  });
}

export default function ProposalDetailPage() {
  const {
    proposal,
    sections,
    milestones,
    actions,
    comments,
    totalProgress,
    daysRemaining,
    currentUserId,
    isOwner,
    memberNames,
    members,
    tenantUsers,
  } = useLoaderData<typeof loader>();

  return (
    <div className="flex h-full">
      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        <ProposalDetail
          proposal={proposal}
          sections={sections}
          comments={comments.map((c) => ({
            ...c,
            authorName: c.authorName ?? undefined,
            createdAt: c.createdAt ? String(c.createdAt) : null,
          }))}
          currentUserId={currentUserId}
          isOwner={isOwner}
          memberNames={memberNames}
        />
      </div>

      {/* Right progress panel */}
      <div className="hidden w-[var(--dx-context-panel-width)] shrink-0 overflow-y-auto border-l border-[var(--dx-border-subtle,var(--axis-border-default))] bg-[var(--dx-surface-panel,var(--axis-surface-default))] lg:block">
        <ProgressPanel
          proposalId={proposal.id}
          milestones={milestones}
          actions={actions}
          totalProgress={totalProgress}
          daysRemaining={daysRemaining}
          isOwner={isOwner}
          members={members}
          tenantUsers={tenantUsers}
        />
      </div>
    </div>
  );
}
