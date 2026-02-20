/**
 * /api/topics/:id/suggestions — 미처리 enrichment 제안 목록 조회
 * GET: 해당 Topic Graph의 pending suggestion 목록
 */

import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { GraphStore } from "~/lib/graph/store";

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

    const store = new GraphStore(db);
    const graph = await store.getByScopeId("topic", topicId);

    if (!graph) {
      return json({ suggestions: [] });
    }

    const suggestions = await store.getPendingSuggestions(graph.id);

    return json({ suggestions });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.topics.$id.suggestions] loader error:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}
