/**
 * /api/conversations — Conversation CRUD.
 * GET: list conversations for current user
 * POST: create new conversation
 * DELETE: delete conversation (via _method or query param)
 */

import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { conversations } from "~/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { tenantWhere } from "~/lib/query/tenant-scope";

function sanitizeTitle(raw: string | null): string {
  if (!raw) return "새 대화";
  const cleaned = raw.replace(/\uFFFD/g, "").trim();
  return cleaned.length > 0 ? cleaned : "새 대화";
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const convs = await db
    .select()
    .from(conversations)
    .where(tenantWhere(conversations, ctx.tenantId, eq(conversations.userId, ctx.user.id)))
    .orderBy(desc(conversations.updatedAt))
    .limit(50);

  return json({
    conversations: convs.map((c) => ({
      id: c.id,
      title: sanitizeTitle(c.title),
      createdAt: c.createdAt ? new Date(c.createdAt).toISOString() : null,
      updatedAt: c.updatedAt ? new Date(c.updatedAt).toISOString() : null,
    })),
  });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  if (request.method === "POST") {
    const id = crypto.randomUUID();
    await db.insert(conversations).values({
      id,
      userId: ctx.user.id,
      tenantId: ctx.tenantId,
    });
    return json({ id, title: "새 대화" });
  }

  if (request.method === "DELETE") {
    const body = await request.json() as { conversationId: string };
    const { conversationId } = body;

    if (!conversationId) {
      return json({ error: "conversationId required" }, { status: 400 });
    }

    // Verify ownership + tenant
    const conv = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.id, conversationId),
          eq(conversations.userId, ctx.user.id),
          eq(conversations.tenantId, ctx.tenantId)
        )
      )
      .limit(1);

    if (!conv[0]) {
      return json({ error: "Not found" }, { status: 404 });
    }

    await db.delete(conversations).where(eq(conversations.id, conversationId));
    return json({ success: true });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
}
