/**
 * /api/profile/graph — 프로필 Graph API
 *
 * GET:   현재 사용자의 Graph + Projection 조회
 * PUT:   Graph 전체 교체
 * PATCH: 노드 추가/제거
 */

import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { requireUser, getSessionSecret } from "~/lib/auth/session.server";
import { GraphStore } from "~/lib/graph/store";
import { ProjectionBuilder } from "~/lib/graph/projection";
import type { JsonLdGraph, JsonLdNode } from "~/lib/graph/types";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const user = await requireUser(request, db, secret);

  const store = new GraphStore(db);
  const graph = await store.getByScopeId("user", String(user.id));

  const builder = new ProjectionBuilder(db);
  const projection = await builder.getProjection("user", String(user.id), "USER.md");

  return json({
    graph,
    projection: projection?.content ?? null,
    projectionMeta: projection
      ? {
          graphVersion: projection.graphVersion,
          sourceHash: projection.sourceHash,
          generatedAt: projection.generatedAt
            ? new Date(projection.generatedAt).toISOString()
            : null,
        }
      : null,
  });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const user = await requireUser(request, db, secret);

  const store = new GraphStore(db);
  const builder = new ProjectionBuilder(db);
  const scopeId = String(user.id);

  if (request.method === "PUT") {
    const body = (await request.json()) as { jsonld: JsonLdGraph };
    const existing = await store.getByScopeId("user", scopeId);

    if (existing) {
      await store.update(existing.id, body.jsonld, "프로필 전체 업데이트");
    } else {
      await store.create({
        scopeType: "user",
        scopeId,
        jsonld: body.jsonld,
        contentHash: "",
      });
    }

    await builder.syncProjection("user", scopeId);
    return json({ ok: true });
  }

  if (request.method === "PATCH") {
    const body = (await request.json()) as {
      action: "add_node" | "remove_node";
      node: JsonLdNode;
    };

    const existing = await store.getByScopeId("user", scopeId);
    if (!existing) {
      return json({ error: "Graph not found" }, { status: 404 });
    }

    const graph = existing.jsonld;

    if (body.action === "add_node") {
      graph["@graph"].push(body.node);
    } else if (body.action === "remove_node") {
      graph["@graph"] = graph["@graph"].filter((n) => n["@id"] !== body.node["@id"]);
    }

    await store.update(existing.id, graph, `노드 ${body.action}: ${body.node["@id"]}`);
    await builder.syncProjection("user", scopeId);
    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
}
