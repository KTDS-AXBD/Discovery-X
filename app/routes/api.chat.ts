/**
 * POST /api/chat — SSE streaming chat endpoint.
 * Accepts { conversationId, message } and returns text/event-stream response.
 */

import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { conversations } from "~/db/schema";
import { eq } from "drizzle-orm";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { createAgentStreamResponse } from "~/features/chat/agent/executor-stream";
import { tryAcquireSSESession, releaseSSESession } from "~/lib/rate-limit/sse-limiter";
import { isAgentDOAvailable, delegateToDO } from "~/features/chat/agent/agent-do.stub";

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = ctx.user;

  // SSE 동시성 제한 — 사용자당 최대 3개 세션
  if (!tryAcquireSSESession(user.id)) {
    return json(
      { error: "동시 채팅 세션이 너무 많습니다. 다른 탭을 닫고 다시 시도하세요." },
      { status: 429 },
    );
  }

  const apiKey = (context.cloudflare.env as unknown as Record<string, string>).ANTHROPIC_API_KEY;
  if (!apiKey) {
    releaseSSESession(user.id);
    return json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  const env = context.cloudflare.env as unknown as Record<string, unknown>;
  const body = await request.json() as { conversationId: string; message: string; mode?: "default" | "ideas" };
  const { conversationId, message, mode } = body;

  if (!conversationId || !message?.trim()) {
    releaseSSESession(user.id);
    return json({ error: "conversationId and message are required" }, { status: 400 });
  }

  // Verify conversation exists and belongs to user
  const conv = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);

  if (!conv[0] || conv[0].userId !== user.id) {
    releaseSSESession(user.id);
    return json({ error: "Conversation not found" }, { status: 404 });
  }

  // FF_AGENT_DO가 활성화되면 agent-worker DO로 위임
  if (isAgentDOAvailable(env)) {
    releaseSSESession(user.id); // DO가 자체 동시성 제어하므로 SSE limiter 해제
    const doResponse = await delegateToDO(
      { conversationId, message, mode, userId: user.id, tenantId: ctx.tenantId },
      env,
    );
    // DO가 429를 반환하면 그대로 전달
    return new Response(doResponse.body, {
      status: doResponse.status,
      headers: doResponse.headers,
    });
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

  const originalStream = createAgentStreamResponse(db, apiKey, conversationId, message, ctx.tenantId, mode);

  // TransformStream으로 래핑 — 종료 시 SSE 세션 해제 보장
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const reader = originalStream.getReader();

  (async () => {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        await writer.write(value);
      }
    } catch {
      // 클라이언트 연결 끊김 — 정상 케이스
    } finally {
      releaseSSESession(user.id);
      await writer.close().catch(() => {});
    }
  })();

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
