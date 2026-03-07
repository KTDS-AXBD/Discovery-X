import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useLoaderData } from "@remix-run/react";
import { eq } from "drizzle-orm";
import { getDb } from "~/db";
import { proposals, proposalLikes } from "~/features/proposals/db/schema";
import { users } from "~/db";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { ProposalGrid } from "~/features/proposals/ui/ProposalGrid";
import type { ProposalCardData } from "~/features/proposals/ui/ProposalCard";

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
      .where(eq(proposals.status, "FORMALIZATION"));

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

export default function FormalizationTab() {
  const { proposals: items } = useLoaderData<typeof loader>();

  return (
    <div className="p-6">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-fg">형상화</h2>
        <p className="text-xs text-fg-tertiary">아이디어를 구체화하고 있는 제안들</p>
      </div>
      <ProposalGrid proposals={items} emptyMessage="형상화 단계의 제안이 없습니다." />
    </div>
  );
}
