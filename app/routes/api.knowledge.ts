/**
 * /api/knowledge — 팀 지식 그래프 통합 조회
 * GET: scope=all|user|topic|org, search=키워드
 */

import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { graphs, users, topics, tenants } from "~/db";
import { requireUser, getSessionSecret } from "~/lib/auth/session.server";
import type { ScopeType, JsonLdGraph, JsonLdNode } from "~/lib/graph/types";

// ─── 타입 ───────────────────────────────────────────────────────────

interface GraphSummary {
  id: string;
  scopeType: ScopeType;
  scopeId: string;
  scopeName: string;
  nodeCount: number;
  version: number;
  updatedAt: string;
}

interface KnowledgeResponse {
  graphs: GraphSummary[];
  stats: { total: number; user: number; topic: number; org: number };
}

// ─── 유틸 ───────────────────────────────────────────────────────────

/** JSON-LD 문자열을 안전하게 파싱 */
function parseJsonLd(raw: string): JsonLdGraph | null {
  try {
    return JSON.parse(raw) as JsonLdGraph;
  } catch {
    return null;
  }
}

/** 노드의 label/description에서 키워드 검색 */
function matchesSearch(nodes: JsonLdNode[], keyword: string): boolean {
  const lower = keyword.toLowerCase();
  return nodes.some((node) => {
    const label = node["dx:label"];
    const description = node["dx:description"];
    const name = node["dx:name"];
    return (
      (typeof label === "string" && label.toLowerCase().includes(lower)) ||
      (typeof description === "string" &&
        description.toLowerCase().includes(lower)) ||
      (typeof name === "string" && name.toLowerCase().includes(lower))
    );
  });
}

// ─── Loader ─────────────────────────────────────────────────────────

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env;
  const db = getDb(env.DB);
  const secret = getSessionSecret(env);
  await requireUser(request, db, secret);

  const url = new URL(request.url);
  const scopeFilter = (url.searchParams.get("scope") ?? "all") as
    | "all"
    | ScopeType;
  const search = url.searchParams.get("search")?.trim() ?? "";

  // 전체 graphs 조회
  const allGraphs = await db.select().from(graphs);

  // scope 이름 매핑을 위한 lookup 테이블 구축
  const userIds = new Set<string>();
  const topicIds = new Set<string>();
  const tenantIds = new Set<string>();

  for (const g of allGraphs) {
    if (g.scopeType === "user") userIds.add(g.scopeId);
    else if (g.scopeType === "topic") topicIds.add(g.scopeId);
    else if (g.scopeType === "org") tenantIds.add(g.scopeId);
  }

  // 각 scope별 이름 조회 (병렬)
  const nameMap = new Map<string, string>();

  const [userRows, topicRows, tenantRows] = await Promise.all([
    userIds.size > 0
      ? db.select({ id: users.id, name: users.name }).from(users)
      : Promise.resolve([]),
    topicIds.size > 0
      ? db
          .select({ id: topics.id, name: topics.name })
          .from(topics)
      : Promise.resolve([]),
    tenantIds.size > 0
      ? db
          .select({ id: tenants.id, name: tenants.name })
          .from(tenants)
      : Promise.resolve([]),
  ]);

  for (const u of userRows) {
    if (userIds.has(String(u.id))) nameMap.set(`user:${u.id}`, u.name);
  }
  for (const t of topicRows) {
    if (topicIds.has(t.id)) nameMap.set(`topic:${t.id}`, t.name);
  }
  for (const t of tenantRows) {
    if (tenantIds.has(t.id)) nameMap.set(`org:${t.id}`, t.name);
  }

  // 필터링 + 변환
  const results: GraphSummary[] = [];
  const stats = { total: 0, user: 0, topic: 0, org: 0 };

  for (const g of allGraphs) {
    const scope = g.scopeType as ScopeType;

    // scope 필터
    if (scopeFilter !== "all" && scope !== scopeFilter) continue;

    const parsed = parseJsonLd(g.jsonld);
    const nodes = parsed?.["@graph"] ?? [];

    // 검색 필터
    if (search && !matchesSearch(nodes, search)) continue;

    const scopeName =
      nameMap.get(`${scope}:${g.scopeId}`) ?? g.scopeId;

    results.push({
      id: g.id,
      scopeType: scope,
      scopeId: g.scopeId,
      scopeName,
      nodeCount: nodes.length,
      version: g.version,
      updatedAt: g.updatedAt
        ? new Date(
            typeof g.updatedAt === "number"
              ? g.updatedAt * 1000
              : g.updatedAt
          ).toISOString()
        : "",
    });

    // 통계 (검색 필터 적용 후)
    stats.total++;
    if (scope === "user") stats.user++;
    else if (scope === "topic") stats.topic++;
    else if (scope === "org") stats.org++;
  }

  // 최신 업데이트 순 정렬
  results.sort(
    (a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  return json<KnowledgeResponse>({ graphs: results, stats });
}
