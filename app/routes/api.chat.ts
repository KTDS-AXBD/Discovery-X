/**
 * POST /api/chat — SSE streaming chat endpoint.
 * Accepts { conversationId, message } and returns text/event-stream response.
 */

import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { conversations } from "~/db/schema";
import { eq } from "drizzle-orm";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";
import { createAgentStreamResponse } from "~/lib/agent/executor";

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const user = await getUserFromSession(request, db, secret);

  if (!user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = (context.cloudflare.env as unknown as Record<string, string>).ANTHROPIC_API_KEY;
  if (!apiKey) {
    return json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  const body = await request.json() as { conversationId: string; message: string };
  const { conversationId, message } = body;

  if (!conversationId || !message?.trim()) {
    return json({ error: "conversationId and message are required" }, { status: 400 });
  }

  // Verify conversation exists and belongs to user
  const conv = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);

  if (!conv[0] || conv[0].userId !== user.id) {
    return json({ error: "Conversation not found" }, { status: 404 });
  }

  // Update conversation title if first message
  if (!conv[0].title || conv[0].title === "새 대화") {
    const chars = Array.from(message.trim());
    const title = chars.slice(0, 50).join("") + (chars.length > 50 ? "..." : "");
    await db
      .update(conversations)
      .set({ title, updatedAt: new Date() })
      .where(eq(conversations.id, conversationId));
  } else {
    await db
      .update(conversations)
      .set({ updatedAt: new Date() })
      .where(eq(conversations.id, conversationId));
  }

  const stream = createAgentStreamResponse(db, apiKey, conversationId, message);

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
