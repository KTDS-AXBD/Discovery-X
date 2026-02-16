/**
 * /api/knowledge/:graphId — 특정 Graph의 노드/엣지 상세
 * GET: 노드 목록 + 엣지(관계) 목록 추출
 */

import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { eq } from "drizzle-orm";

import { getDb } from "~/db";
import { graphs, projections } from "~/db";
import { requireUser, getSessionSecret } from "~/lib/auth/session.server";
import type { ScopeType, JsonLdGraph, JsonLdNode } from "~/lib/graph/types";

// ─── 타입 ───────────────────────────────────────────────────────────

interface Edge {
  source: string;
  target: string;
  type: string;
}

interface GraphDetailResponse {
  graph: {
    id: string;
    scopeType: ScopeType;
    scopeId: string;
    version: number;
    nodes: JsonLdNode[];
    edges: Edge[];
  };
  projection: {
    projType: string;
    content: string;
    graphVersion: number;
  } | null;
}

// ─── 관계(엣지) 키 목록 ────────────────────────────────────────────

const RELATION_KEYS = [
  "dx:relatedTo",
  "dx:partOf",
  "dx:dependsOn",
  "dx:influences",
  "dx:contradictsTo",
  "dx:supersedes",
  "dx:belongsTo",
  "dx:references",
];

/** 노드에서 관계 엣지 추출 */
function extractEdges(nodes: JsonLdNode[]): Edge[] {
  const edges: Edge[] = [];

  for (const node of nodes) {
    const sourceId = node["@id"];

    for (const key of RELATION_KEYS) {
      const value = node[key];
      if (!value) continue;

      // 관계 타입 이름 (dx: 접두사 제거)
      const relType = key.replace("dx:", "");

      // 단일 참조: { "@id": "node:xxx" }
      if (isNodeRef(value)) {
        edges.push({
          source: sourceId,
          target: (value as { "@id": string })["@id"],
          type: relType,
        });
      }
      // 배열 참조: [{ "@id": "node:xxx" }, ...]
      else if (Array.isArray(value)) {
        for (const item of value) {
          if (isNodeRef(item)) {
            edges.push({
              source: sourceId,
              target: (item as { "@id": string })["@id"],
              type: relType,
            });
          }
        }
      }
    }
  }

  return edges;
}

/** JSON-LD 노드 참조인지 확인 */
function isNodeRef(v: unknown): boolean {
  return (
    typeof v === "object" &&
    v !== null &&
    "@id" in (v as Record<string, unknown>)
  );
}

// ─── Loader ─────────────────────────────────────────────────────────

export async function loader({ request, context, params }: LoaderFunctionArgs) {
  const env = context.cloudflare.env;
  const db = getDb(env.DB);
  const secret = getSessionSecret(env);
  await requireUser(request, db, secret);

  const graphId = params.graphId;
  if (!graphId) {
    return json({ error: "graphId 파라미터가 필요합니다" }, { status: 400 });
  }

  // Graph 조회
  const rows = await db
    .select()
    .from(graphs)
    .where(eq(graphs.id, graphId))
    .limit(1);

  if (rows.length === 0) {
    return json({ error: "Graph를 찾을 수 없습니다" }, { status: 404 });
  }

  const row = rows[0];
  let parsed: JsonLdGraph;
  try {
    parsed = JSON.parse(row.jsonld) as JsonLdGraph;
  } catch {
    return json({ error: "Graph JSON-LD 파싱 실패" }, { status: 500 });
  }

  const nodes = parsed["@graph"] ?? [];
  const edges = extractEdges(nodes);

  // Projection 조회 (해당 scope의 가장 최근 projection)
  const projRows = await db
    .select()
    .from(projections)
    .where(eq(projections.scopeId, row.scopeId))
    .limit(1);

  const projection =
    projRows.length > 0
      ? {
          projType: projRows[0].projType,
          content: projRows[0].content,
          graphVersion: projRows[0].graphVersion,
        }
      : null;

  return json<GraphDetailResponse>({
    graph: {
      id: row.id,
      scopeType: row.scopeType as ScopeType,
      scopeId: row.scopeId,
      version: row.version,
      nodes,
      edges,
    },
    projection,
  });
}
