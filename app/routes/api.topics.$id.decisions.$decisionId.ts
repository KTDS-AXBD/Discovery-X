/**
 * /api/topics/:id/decisions/:decisionId — Decision 수정 / 삭제
 * PATCH: Decision 노드 수정
 * DELETE: Decision 노드 삭제
 */

import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { GraphStore } from "~/lib/graph/store";
import type { JsonLdGraph } from "~/lib/graph/types";

export async function action({
  request,
  params,
  context,
}: ActionFunctionArgs) {
  const env = context.cloudflare.env;
  const db = getDb(env.DB);
  const secret = getSessionSecret(env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const topicId = params.id;
  const decisionId = params.decisionId;
  if (!topicId || !decisionId) {
    return json({ error: "id, decisionId 파라미터가 필요합니다" }, { status: 400 });
  }

  const store = new GraphStore(db);
  const graph = await store.getByScopeId("topic", topicId);

  if (!graph) {
    return json({ error: "Topic Graph를 찾을 수 없습니다" }, { status: 404 });
  }

  const nodes = graph.jsonld["@graph"];
  const targetIdx = nodes.findIndex(
    (n) => n["@id"] === decisionId && n["@type"] === "dx:Decision",
  );

  if (targetIdx === -1) {
    return json({ error: "Decision을 찾을 수 없습니다" }, { status: 404 });
  }

  if (request.method === "PATCH") {
    const body = (await request.json()) as {
      summary?: string;
      date?: string;
      context?: string;
      decidedBy?: string;
    };

    const updated = { ...nodes[targetIdx] };
    if (body.summary !== undefined) updated["dx:summary"] = body.summary;
    if (body.date !== undefined) updated["dx:date"] = body.date;
    if (body.context !== undefined) updated["dx:context"] = body.context;
    if (body.decidedBy !== undefined) updated["dx:decidedBy"] = body.decidedBy;
    updated["dx:updatedAt"] = new Date().toISOString();

    const updatedNodes = [...nodes];
    updatedNodes[targetIdx] = updated;

    const updatedJsonld: JsonLdGraph = {
      ...graph.jsonld,
      "@graph": updatedNodes,
    };

    await store.update(graph.id, updatedJsonld, "결정 수정");

    return json({ decision: updated });
  }

  if (request.method === "DELETE") {
    const filteredNodes = nodes.filter(
      (n) => !(n["@id"] === decisionId && n["@type"] === "dx:Decision"),
    );

    const updatedJsonld: JsonLdGraph = {
      ...graph.jsonld,
      "@graph": filteredNodes,
    };

    await store.update(graph.id, updatedJsonld, "결정 삭제");

    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
}
