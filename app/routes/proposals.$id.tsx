import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useLoaderData } from "@remix-run/react";
import { getDb } from "~/db";
import { ProposalService } from "~/features/proposals/service/proposal.service";
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

  const service = new ProposalService(db);
  const detail = await service.getDetail(params.id!, ctx.tenantId);

  if (!detail) {
    throw new Response("Not Found", { status: 404 });
  }

  return json({
    proposal: detail.proposal,
    sections: detail.sections,
    comments: detail.comments,
    currentUserId: ctx.user.id,
    isOwner: detail.proposal.ownerId === ctx.user.id,
    ownerName: detail.ownerName,
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

      {/* Body: Sidebar + Content — wireframe 2-column layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar (TOC + Reviews) - hidden on mobile */}
        <div className="hidden lg:flex">
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
        <div className="flex-1 overflow-y-auto bg-surface">
          <ProposalContentView
            proposal={proposal}
            sections={sections}
          />
        </div>
      </div>
    </div>
  );
}
