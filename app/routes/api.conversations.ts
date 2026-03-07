/**
 * /api/conversations — Conversation CRUD.
 * GET: list conversations for current user
 * POST: create new conversation
 * DELETE: delete conversation (via _method or query param)
 */

import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { ChatSessionService } from "~/features/chat/service";

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

  const service = new ChatSessionService(db);
  const convs = await service.listConversations(ctx.user.id, ctx.tenantId, 50);

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

  const service = new ChatSessionService(db);

  if (request.method === "POST") {
    // BD팀 PoC: sourceItemId로 소스 연결 대화 생성
    let title = "새 대화";
    let sourceItemId: string | undefined;

    const contentType = request.headers.get("Content-Type") || "";
    if (contentType.includes("application/json")) {
      try {
        const body = (await request.json()) as { title?: string; sourceItemId?: string };
        if (body.title) title = body.title;
        if (body.sourceItemId) sourceItemId = body.sourceItemId;
      } catch {
        // empty body OK
      }
    }

    return json(
      await service.createConversation({
        userId: ctx.user.id,
        tenantId: ctx.tenantId,
        title,
        sourceItemId,
      }),
    );
  }

  if (request.method === "DELETE") {
    const body = await request.json() as { conversationId: string };
    const { conversationId } = body;

    if (!conversationId) {
      return json({ error: "conversationId required" }, { status: 400 });
    }

    const result = await service.deleteConversation(
      conversationId,
      ctx.user.id,
      ctx.tenantId,
    );

    if (!result) {
      return json({ error: "Not found" }, { status: 404 });
    }

    return json(result);
  }

  return json({ error: "Method not allowed" }, { status: 405 });
}
