import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useLoaderData } from "@remix-run/react";
import { eq } from "drizzle-orm";
import { getDb } from "~/db";
import { proposals, proposalLikes } from "~/features/proposals/db/schema";
import { users } from "~/db/schema";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { ProposalGrid } from "~/components/proposals/ProposalGrid";
import type { ProposalCardData } from "~/components/proposals/ProposalCard";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return redirect("/login");
  }

  try {
    const rows = await db
      .select({
        id: proposals.id,
        title: proposals.title,
        description: proposals.description,
        status: proposals.status,
        category: proposals.category,
        likeCount: proposals.likeCount,
        commentCount: proposals.commentCount,
        createdAt: proposals.createdAt,
        updatedAt: proposals.updatedAt,
        ownerName: users.name,
      })
      .from(proposals)
      .leftJoin(users, eq(proposals.ownerId, users.id))
      .where(eq(proposals.status, "VALIDATION"));

    const userLikes = await db
      .select({ proposalId: proposalLikes.proposalId })
      .from(proposalLikes)
      .where(eq(proposalLikes.userId, ctx.user.id));
    const likedSet = new Set(userLikes.map((l) => l.proposalId));

    const items: ProposalCardData[] = rows.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      status: p.status,
      category: p.category,
      ownerName: p.ownerName,
      likeCount: p.likeCount,
      commentCount: p.commentCount,
      liked: likedSet.has(p.id),
      createdAt: p.createdAt ? String(p.createdAt) : null,
      updatedAt: p.updatedAt ? String(p.updatedAt) : null,
    }));

    return json({ proposals: items });
  } catch {
    return json({ proposals: [] });
  }
}

export default function ValidationTab() {
  const { proposals: items } = useLoaderData<typeof loader>();

  return (
    <div className="p-6">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-[var(--axis-text-primary)]">검증</h2>
        <p className="text-xs text-[var(--axis-text-tertiary)]">실제 검증을 진행 중인 제안들</p>
      </div>
      <ProposalGrid proposals={items} emptyMessage="검증 단계의 제안이 없습니다." />
    </div>
  );
}
