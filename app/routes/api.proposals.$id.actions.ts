import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { and, eq } from "drizzle-orm";
import { getDb } from "~/db";
import { proposals, proposalActions } from "~/features/proposals/db/schema";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";

export async function action({ params, request, context }: ActionFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  if (request.method === "POST") {
    const body = await request.json() as { actionId: string; completed: boolean };

    const proposal = await db.select({ tenantId: proposals.tenantId })
      .from(proposals).where(eq(proposals.id, params.id!)).get();
    if (!proposal || proposal.tenantId !== ctx.tenantId) {
      return json({ error: "Not found" }, { status: 404 });
    }

    const actionItem = await db.select({ id: proposalActions.id })
      .from(proposalActions)
      .where(and(eq(proposalActions.id, body.actionId), eq(proposalActions.proposalId, params.id!)))
      .get();
    if (!actionItem) {
      return json({ error: "Action not found" }, { status: 404 });
    }

    await db
      .update(proposalActions)
      .set({ completed: body.completed ? 1 : 0 })
      .where(eq(proposalActions.id, body.actionId));

    return json({ success: true });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
}
