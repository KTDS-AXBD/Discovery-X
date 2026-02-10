import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { desc, eq } from "drizzle-orm";
import { getDb } from "~/db";
import { proposals } from "~/features/proposals/db/schema";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const list = await db
    .select()
    .from(proposals)
    .where(eq(proposals.tenantId, ctx.tenantId))
    .orderBy(desc(proposals.updatedAt));

  return json({ proposals: list });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  if (request.method === "DELETE") {
    const body = await request.json() as { id: string };
    await db.delete(proposals).where(eq(proposals.id, body.id));
    return json({ success: true });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
}
