import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "~/db";
import { proposals, proposalLikes } from "~/features/proposals/db/schema";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";

export async function action({ params, request, context }: ActionFunctionArgs) {
  try {
    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, { status: 405 });
    }

    const db = getDb(context.cloudflare.env.DB);
    const secret = getSessionSecret(context.cloudflare.env);
    const ctx = await getSessionContext(request, db, secret);

    if (!ctx) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    const proposalId = params.id!;
    const proposal = await db.select({ id: proposals.id, tenantId: proposals.tenantId })
      .from(proposals).where(eq(proposals.id, proposalId)).get();

    if (!proposal || proposal.tenantId !== ctx.tenantId) {
      return json({ error: "Not found" }, { status: 404 });
    }

    // Toggle: 좋아요 존재 여부 확인
    const existing = await db.select({ id: proposalLikes.id })
      .from(proposalLikes)
      .where(and(
        eq(proposalLikes.proposalId, proposalId),
        eq(proposalLikes.userId, ctx.user.id),
      ))
      .get();

    if (existing) {
      // Unlike
      await db.delete(proposalLikes).where(eq(proposalLikes.id, existing.id));
      await db.update(proposals)
        .set({ likeCount: sql`MAX(0, ${proposals.likeCount} - 1)` })
        .where(eq(proposals.id, proposalId));
      return json({ liked: false });
    } else {
      // Like
      await db.insert(proposalLikes).values({
        proposalId,
        userId: ctx.user.id,
      });
      await db.update(proposals)
        .set({ likeCount: sql`${proposals.likeCount} + 1` })
        .where(eq(proposals.id, proposalId));
      return json({ liked: true });
    }
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.proposals.$id.likes] action error:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}
