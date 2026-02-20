/**
 * /api/topics/:id/suggestions/:suggestionId — 제안 승인/거절
 * POST: { action: "approve" | "reject", reason?: string }
 */

import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { requireUser, getSessionSecret } from "~/lib/auth/session.server";
import { GraphStore } from "~/lib/graph/store";

export async function action({
  request,
  params,
  context,
}: ActionFunctionArgs) {
  try {
    const env = context.cloudflare.env;
    const db = getDb(env.DB);
    const secret = getSessionSecret(env);

    let user;
    try {
      user = await requireUser(request, db, secret);
    } catch (e) {
      if (e instanceof Response) throw e;
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    const topicId = params.id;
    const suggestionId = params.suggestionId;

    if (!topicId || !suggestionId) {
      return json({ error: "id, suggestionId 파라미터가 필요합니다" }, { status: 400 });
    }

    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, { status: 405 });
    }

    const body = (await request.json()) as {
      action?: string;
      reason?: string;
    };

    if (!body.action || !["approve", "reject"].includes(body.action)) {
      return json(
        { error: "action은 'approve' 또는 'reject'이어야 합니다" },
        { status: 400 },
      );
    }

    const store = new GraphStore(db);
    const graph = await store.getByScopeId("topic", topicId);

    if (!graph) {
      return json({ error: "해당 Topic의 Graph가 없습니다" }, { status: 404 });
    }

    const audit = { actorId: user.id, actorType: "user" as const };
    const eventId = parseInt(suggestionId, 10);

    if (isNaN(eventId)) {
      return json({ error: "유효하지 않은 suggestionId" }, { status: 400 });
    }

    if (body.action === "approve") {
      await store.approveSuggestion(graph.id, eventId, audit);
    } else {
      await store.rejectSuggestion(graph.id, eventId, body.reason, audit);
    }

    return json({ success: true });
  } catch (error) {
    if (error instanceof Response) throw error;

    if (error instanceof Error) {
      if (error.message.includes("not found")) {
        return json({ error: error.message }, { status: 404 });
      }
      if (error.message.includes("already processed")) {
        return json({ error: error.message }, { status: 409 });
      }
    }

    console.error("[api.topics.$id.suggestions.$suggestionId] action error:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}
