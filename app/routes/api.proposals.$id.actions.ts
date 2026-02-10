import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { eq } from "drizzle-orm";
import { getDb } from "~/db";
import { proposalActions } from "~/features/proposals/db/schema";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";

export async function action({ request, context }: ActionFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  if (request.method === "POST") {
    const body = await request.json() as { actionId: string; completed: boolean };

    await db
      .update(proposalActions)
      .set({ completed: body.completed ? 1 : 0 })
      .where(eq(proposalActions.id, body.actionId));

    return json({ success: true });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
}
