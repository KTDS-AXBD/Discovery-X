/**
 * /api/topics/:id/events — Topic Graph 감사 이벤트 조회
 * GET: 해당 Topic Graph의 변경 이력 (최신 순)
 * query: ?limit=50
 */

import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { TopicService } from "~/features/topic/service";

export async function loader({ request, params, context }: LoaderFunctionArgs) {
  try {
    const env = context.cloudflare.env;
    const db = getDb(env.DB);
    const secret = getSessionSecret(env);
    const ctx = await getSessionContext(request, db, secret);

    if (!ctx) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    const topicId = params.id;
    if (!topicId) {
      return json({ error: "id 파라미터가 필요합니다" }, { status: 400 });
    }

    const url = new URL(request.url);
    const limit = Math.min(
      Math.max(parseInt(url.searchParams.get("limit") || "50", 10) || 50, 1),
      200,
    );

    const service = new TopicService(db);
    const events = await service.listEvents(topicId, limit);

    return json({ events });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.topics.$id.events] error:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}
