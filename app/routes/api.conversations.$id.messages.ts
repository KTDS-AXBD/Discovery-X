/**
 * GET /api/conversations/:id/messages — Fetch messages for a conversation.
 */

import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { conversations, messages } from "~/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";

export async function loader({ request, params, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const user = await getUserFromSession(request, db, secret);

  if (!user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const conversationId = params.id;
  if (!conversationId) {
    return json({ error: "Missing conversation ID" }, { status: 400 });
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

  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt));

  return json({
    messages: msgs.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      toolName: m.toolName,
      toolInput: m.toolInput,
      toolResult: m.toolResult,
      discoveryId: m.discoveryId,
      createdAt: m.createdAt ? new Date(m.createdAt).toISOString() : null,
    })),
  });
}
