import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useLoaderData } from "@remix-run/react";
import { eq } from "drizzle-orm";
import { getDb } from "~/db";
import {
  proposals,
  proposalSections,
  proposalComments,
} from "~/features/proposals/db/schema";
import { users } from "~/db/schema";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { ProposalDetailHeader } from "~/components/proposals/ProposalDetailHeader";
import { ProposalDetailSidebar } from "~/components/proposals/ProposalDetailSidebar";
import { ProposalContentView } from "~/components/proposals/ProposalContentView";

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

  const [sections, commentsRaw, ownerRow] = await Promise.all([
    db.select().from(proposalSections).where(eq(proposalSections.proposalId, params.id!)),
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
    db.select({ name: users.name }).from(users).where(eq(users.id, proposal.ownerId)).get(),
  ]);

  return json({
    proposal,
    sections,
    comments: commentsRaw,
    currentUserId: ctx.user.id,
    isOwner: proposal.ownerId === ctx.user.id,
    ownerName: ownerRow?.name || null,
  });
}

export default function ProposalDetailPage() {
  const {
    proposal,
    sections,
    comments,
    currentUserId,
    isOwner,
    ownerName,
  } = useLoaderData<typeof loader>();

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <ProposalDetailHeader
        proposal={proposal}
        isOwner={isOwner}
        ownerName={ownerName}
      />

      {/* Body: Sidebar + Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar (TOC + Reviews) - hidden on mobile */}
        <div className="hidden lg:block">
          <ProposalDetailSidebar
            proposalId={proposal.id}
            sections={sections}
            comments={comments.map((c) => ({
              ...c,
              authorName: c.authorName ?? undefined,
              createdAt: c.createdAt ? String(c.createdAt) : null,
            }))}
            currentUserId={currentUserId}
          />
        </div>

        {/* Main content */}
        <div className="flex-1 overflow-y-auto">
          <ProposalContentView
            proposal={proposal}
            sections={sections}
          />
        </div>
      </div>
    </div>
  );
}
