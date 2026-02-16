/**
 * POST /api/graph/:id/rollback — Graph 버전 롤백
 *
 * Body: { targetVersion: number }
 * 인증: requireUser
 * 권한: 본인의 user scope Graph만 롤백 가능
 * 성공: { success: true, newVersion: number }
 */

import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { requireUser, getSessionSecret } from "~/lib/auth/session.server";
import { GraphStore } from "~/lib/graph/store";
import { ProjectionBuilder } from "~/lib/graph/projection";
import { ActorType } from "~/lib/types/enums";

export async function action({ request, context, params }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

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

  const body = (await request.json()) as { targetVersion?: number };
  const targetVersion = body.targetVersion;

  if (typeof targetVersion !== "number" || !Number.isInteger(targetVersion)) {
    return json({ error: "targetVersion must be an integer" }, { status: 400 });
  }

  try {
    const result = await store.rollback(graphId, targetVersion, {
      actorId: String(user.id),
      actorType: ActorType.USER,
    });

    // Projection 재생성
    const builder = new ProjectionBuilder(db);
    await builder.syncProjection("user", String(user.id));

    return json({ success: true, newVersion: result.version });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Rollback failed";
    return json({ error: message }, { status: 400 });
  }
}
