/**
 * GET /api/graph/:id/history — Graph 감사 로그 조회
 *
 * Query: ?limit=50 (기본 50, 최대 100)
 * 인증: requireUser
 * 권한: 본인의 user scope Graph만 조회 가능
 */

import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { requireUser, getSessionSecret } from "~/lib/auth/session.server";
import { GraphStore } from "~/lib/graph/store";

export async function loader({ request, context, params }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const user = await requireUser(request, db, secret);

  const graphId = params.id;
  if (!graphId) {
    return json({ error: "Graph ID is required" }, { status: 400 });
  }

  const store = new GraphStore(db);
  const graph = await store.get(graphId);

  if (!graph) {
    return json({ error: "Graph not found" }, { status: 404 });
  }

  // 권한 확인: 본인의 user scope Graph만
  if (graph.scopeType !== "user" || graph.scopeId !== String(user.id)) {
    return json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const limitParam = url.searchParams.get("limit");
  const limit = Math.min(Math.max(Number(limitParam) || 50, 1), 100);

  const events = await store.getHistory(graphId, limit);

  return json({ events });
}
