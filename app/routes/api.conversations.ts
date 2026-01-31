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
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const user = await getUserFromSession(request, db, secret);

  if (!user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const convs = await db
    .select()
    .from(conversations)
    .where(eq(conversations.userId, user.id))
    .orderBy(desc(conversations.updatedAt))
    .limit(50);

  return json({
    conversations: convs.map((c) => ({
      id: c.id,
      title: c.title || "새 대화",
      createdAt: c.createdAt ? new Date(c.createdAt).toISOString() : null,
      updatedAt: c.updatedAt ? new Date(c.updatedAt).toISOString() : null,
    })),
  });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const user = await getUserFromSession(request, db, secret);

  if (!user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  if (request.method === "POST") {
    const id = crypto.randomUUID();
    await db.insert(conversations).values({
      id,
      userId: user.id,
    });
    return json({ id, title: "새 대화" });
  }

  if (request.method === "DELETE") {
    const body = await request.json() as { conversationId: string };
    const { conversationId } = body;

    if (!conversationId) {
      return json({ error: "conversationId required" }, { status: 400 });
    }

    // Verify ownership
    const conv = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.id, conversationId),
          eq(conversations.userId, user.id)
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
