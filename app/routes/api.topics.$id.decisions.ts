/**
 * /api/topics/:id/decisions — Decision 목록 조회 / 추가
 * GET: 해당 Topic의 모든 Decision 노드 목록
 * POST: 새 Decision 노드 추가
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
  const decisions = await query.findByType("topic", topicId, "dx:Decision");

  return json({ decisions });
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
    summary?: string;
    date?: string;
    context?: string;
    decidedBy?: string;
  };

  if (!body.summary?.trim()) {
    return json({ error: "summary는 필수입니다" }, { status: 400 });
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

  // 새 Decision 노드 생성
  const nodeId = `dx:decision-${crypto.randomUUID()}`;
  const newNode: JsonLdNode = {
    "@id": nodeId,
    "@type": "dx:Decision",
    "dx:summary": body.summary.trim(),
    ...(body.date && { "dx:date": body.date }),
    ...(body.context && { "dx:context": body.context }),
    ...(body.decidedBy && { "dx:decidedBy": body.decidedBy }),
    "dx:createdBy": ctx.user.id,
    "dx:createdAt": new Date().toISOString(),
  };

  // @graph 배열에 노드 추가 후 Graph 업데이트
  const updatedJsonld: JsonLdGraph = {
    ...graph.jsonld,
    "@graph": [...graph.jsonld["@graph"], newNode],
  };

  await store.update(graph.id, updatedJsonld, "결정 추가");

  return json({ decision: newNode }, { status: 201 });
}
