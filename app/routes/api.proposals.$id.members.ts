import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { and, eq } from "drizzle-orm";
import { getDb } from "~/db";
import { proposals, proposalMembers } from "~/features/proposals/db/schema";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";

export async function action({ params, request, context }: ActionFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const proposal = await db
    .select({ tenantId: proposals.tenantId })
    .from(proposals)
    .where(eq(proposals.id, params.id!))
    .get();
  if (!proposal || proposal.tenantId !== ctx.tenantId) {
    return json({ error: "Not found" }, { status: 404 });
  }

  if (request.method === "POST") {
    const body = (await request.json()) as { userId: string };

    if (!body.userId) {
      return json({ error: "userId is required" }, { status: 400 });
    }

    // Duplicate check
    const existing = await db
      .select({ userId: proposalMembers.userId })
      .from(proposalMembers)
      .where(
        and(
          eq(proposalMembers.proposalId, params.id!),
          eq(proposalMembers.userId, body.userId),
        ),
      )
      .get();
    if (existing) {
      return json({ error: "이미 등록된 멤버입니다" }, { status: 409 });
    }

    await db.insert(proposalMembers).values({
      proposalId: params.id!,
      userId: body.userId,
    });

    return json({ success: true });
  }

  if (request.method === "DELETE") {
    const body = (await request.json()) as { userId: string };

    if (!body.userId) {
      return json({ error: "userId is required" }, { status: 400 });
    }

    await db
      .delete(proposalMembers)
      .where(
        and(
          eq(proposalMembers.proposalId, params.id!),
          eq(proposalMembers.userId, body.userId),
        ),
      );

    return json({ success: true });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
}
