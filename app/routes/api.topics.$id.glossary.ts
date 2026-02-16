/**
 * /api/topics/:id/glossary — Glossary 목록 조회 / 추가
 * GET: 해당 Topic의 모든 Glossary 노드 목록
 * POST: 새 Glossary 용어 추가
 */

import type {
  LoaderFunctionArgs,
  ActionFunctionArgs,
} from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { GraphStore } from "~/lib/graph/store";
import { GraphQueryEngine } from "~/lib/graph/query";
import type { JsonLdGraph, JsonLdNode } from "~/lib/graph/types";

export async function loader({ request, params, context }: LoaderFunctionArgs) {
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

  const query = new GraphQueryEngine(db);
  const glossary = await query.findByType("topic", topicId, "dx:Glossary");

  return json({ glossary });
}

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
  if (!topicId) {
    return json({ error: "id 파라미터가 필요합니다" }, { status: 400 });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const body = (await request.json()) as {
    term?: string;
    definition?: string;
  };

  if (!body.term?.trim()) {
    return json({ error: "term은 필수입니다" }, { status: 400 });
  }
  if (!body.definition?.trim()) {
    return json({ error: "definition은 필수입니다" }, { status: 400 });
  }

  const store = new GraphStore(db);
  let graph = await store.getByScopeId("topic", topicId);

  // Graph가 없으면 새로 생성
  if (!graph) {
    graph = await store.create({
      scopeType: "topic",
      scopeId: topicId,
      jsonld: {
        "@context": { dx: "https://discovery-x.dev/ns/" },
        "@graph": [],
      },
      contentHash: "",
    });
  }

  // 새 Glossary 노드 생성
  const nodeId = `dx:glossary-${crypto.randomUUID()}`;
  const newNode: JsonLdNode = {
    "@id": nodeId,
    "@type": "dx:Glossary",
    "dx:term": body.term.trim(),
    "dx:definition": body.definition.trim(),
    "dx:createdBy": ctx.user.id,
    "dx:createdAt": new Date().toISOString(),
  };

  const updatedJsonld: JsonLdGraph = {
    ...graph.jsonld,
    "@graph": [...graph.jsonld["@graph"], newNode],
  };

  await store.update(graph.id, updatedJsonld, "용어 추가");

  return json({ term: newNode }, { status: 201 });
}
