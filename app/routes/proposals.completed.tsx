import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useLoaderData } from "@remix-run/react";
import { eq, inArray } from "drizzle-orm";
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
        closeType: proposals.closeType,
        likeCount: proposals.likeCount,
        commentCount: proposals.commentCount,
        createdAt: proposals.createdAt,
        updatedAt: proposals.updatedAt,
        ownerName: users.name,
      })
      .from(proposals)
      .leftJoin(users, eq(proposals.ownerId, users.id))
      .where(inArray(proposals.status, ["COMPLETED", "CLOSED"]));

    const userLikes = await db
      .select({ proposalId: proposalLikes.proposalId })
      .from(proposalLikes)
      .where(eq(proposalLikes.userId, ctx.user.id));
    const likedSet = new Set(userLikes.map((l) => l.proposalId));

    const completed: ProposalCardData[] = [];
    const closed: ProposalCardData[] = [];

    for (const p of rows) {
      const card: ProposalCardData = {
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
      };
      if (p.status === "COMPLETED") {
        completed.push(card);
      } else {
        closed.push(card);
      }
    }

    return json({ completed, closed });
  } catch {
    return json({ completed: [], closed: [] });
  }
}

export default function CompletedTab() {
  const { completed, closed } = useLoaderData<typeof loader>();

  return (
    <div className="p-6 space-y-8">
      {/* Completed */}
      <div>
        <div className="mb-4">
          <h2 className="text-lg font-bold text-fg">완료</h2>
          <p className="text-xs text-fg-tertiary">파이프라인을 통과해 완료된 제안들</p>
        </div>
        <ProposalGrid proposals={completed} emptyMessage="완료된 제안이 없습니다." />
      </div>

      {/* Closed */}
      <div>
        <div className="mb-4">
          <h2 className="text-lg font-bold text-fg">종료</h2>
          <p className="text-xs text-fg-tertiary">보류 또는 폐기된 제안들</p>
        </div>
        <ProposalGrid proposals={closed} emptyMessage="종료된 제안이 없습니다." />
      </div>
    </div>
  );
}
