/**
 * /api/topics/:id/members/:userId — 멤버 역할 변경
 * PATCH: { role }
 */

import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { TopicService } from "~/features/topic/service/topic.service";

export async function action({ request, params, context }: ActionFunctionArgs) {
  try {
    if (request.method !== "PATCH") {
      return json({ error: "Method not allowed" }, { status: 405 });
    }

    const env = context.cloudflare.env;
    const db = getDb(env.DB);
    const secret = getSessionSecret(env);
    const ctx = await getSessionContext(request, db, secret);

    if (!ctx) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    const topicId = params.id;
    const userId = params.userId;
    if (!topicId || !userId) {
      return json(
        { error: "id와 userId 파라미터가 필요합니다" },
        { status: 400 },
      );
    }

    const body = (await request.json()) as {
      role?: "owner" | "editor" | "viewer";
    };

    if (!body.role) {
      return json({ error: "role은 필수입니다" }, { status: 400 });
    }

    const service = new TopicService(db);
    await service.updateMemberRole(topicId, userId, body.role);

    return json({ success: true });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.topics.$id.members.$userId] action error:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}
