/**
 * Ontology Intelligence — Phase 2 분석 엔진
 *
 * 4개 분석 알고리즘:
 * 1. detectPatterns    — 반복 edge 경로 패턴 감지
 * 2. detectContradictions — supports/contradicts 동시 존재 감지
 * 3. detectClusters    — Union-Find 연결 컴포넌트 식별
 * 4. analyzeCentrality — Degree centrality 기반 영향력 분석
 */

import { eq, and, inArray, ne } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { contextNodes, contextEdges, discoveries, ontologyTypes } from "~/db/schema";

// --- Result Types ---

export interface PatternResult {
  path: string[];       // ontologyType 경로 (e.g. ["market", "customer", "risk"])
  count: number;
  examples: Array<{ fromLabel: string; toLabel: string }>;
}

export interface ContradictionResult {
  nodeA: { id: string; label: string };
  nodeB: { id: string; label: string };
  supportEdges: Array<{ id: string; strength: number; discoveryId: string }>;
  contradictEdges: Array<{ id: string; strength: number; discoveryId: string }>;
}

export interface ClusterResult {
  clusterId: number;
  nodes: Array<{ id: string; label: string; discoveryId: string }>;
  edgeCount: number;
  density: number;
}

export interface CentralityResult {
  globalEntityId: string;
  label: string;
  ontologyType: string;
  inDegree: number;
  outDegree: number;
  totalDegree: number;
  discoveryCount: number;
}

// --- Internal helpers ---

/** 테넌트 소속 Discovery ID 목록 조회 */
async function getTenantDiscoveryIds(
  db: DrizzleD1Database<Record<string, unknown>>,
  tenantId: string,
): Promise<string[]> {
  const rows = await db
    .select({ id: discoveries.id })
    .from(discoveries)
    .where(eq(discoveries.tenantId, tenantId));
  return rows.map((r) => r.id);
}

/** 테넌트 소속 유효 노드 조회 (reviewed !== 2) */
async function getActiveNodes(
  db: DrizzleD1Database<Record<string, unknown>>,
  discoveryIds: string[],
) {
  if (discoveryIds.length === 0) return [];
  return db
    .select({
      id: contextNodes.id,
      label: contextNodes.label,
      discoveryId: contextNodes.discoveryId,
      ontologyTypeId: contextNodes.ontologyTypeId,
      globalEntityId: contextNodes.globalEntityId,
    })
    .from(contextNodes)
    .where(
      and(
        inArray(contextNodes.discoveryId, discoveryIds),
        ne(contextNodes.reviewed, 2),
      ),
    );
}

/** 노드 ID 집합에 연결된 엣지 조회 */
async function getEdgesForNodes(
  db: DrizzleD1Database<Record<string, unknown>>,
  nodeIds: Set<string>,
) {
  if (nodeIds.size === 0) return [];
  const nodeIdArr = [...nodeIds];
  // 양쪽 끝 중 하나라도 nodeIds에 포함된 엣지
  const allEdges = await db
    .select({
      id: contextEdges.id,
      fromNodeId: contextEdges.fromNodeId,
      toNodeId: contextEdges.toNodeId,
      relationType: contextEdges.relationType,
      strength: contextEdges.strength,
    })
    .from(contextEdges)
    .where(inArray(contextEdges.fromNodeId, nodeIdArr));

  const reverseEdges = await db
    .select({
      id: contextEdges.id,
      fromNodeId: contextEdges.fromNodeId,
      toNodeId: contextEdges.toNodeId,
      relationType: contextEdges.relationType,
      strength: contextEdges.strength,
    })
    .from(contextEdges)
    .where(inArray(contextEdges.toNodeId, nodeIdArr));

  // Deduplicate by edge id
  const edgeMap = new Map<string, typeof allEdges[0]>();
  for (const e of [...allEdges, ...reverseEdges]) {
    if (nodeIds.has(e.fromNodeId) && nodeIds.has(e.toNodeId)) {
      edgeMap.set(e.id, e);
    }
  }
  return [...edgeMap.values()];
}

// ============================================================================
// 1. detectPatterns — 빈도 높은 edge 경로 패턴 감지
// ============================================================================

export async function detectPatterns(
  db: DrizzleD1Database<Record<string, unknown>>,
  tenantId: string,
): Promise<PatternResult[]> {
  const discoveryIds = await getTenantDiscoveryIds(db, tenantId);
  if (discoveryIds.length === 0) return [];

  const nodes = await getActiveNodes(db, discoveryIds);
  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges = await getEdgesForNodes(db, nodeIds);

  // Build lookup maps
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  // ontologyTypeId → adjacency list
  const adjacency = new Map<string, Set<string>>(); // fromNodeId → Set<toNodeId>
  for (const edge of edges) {
    if (!adjacency.has(edge.fromNodeId)) adjacency.set(edge.fromNodeId, new Set());
    adjacency.get(edge.fromNodeId)!.add(edge.toNodeId);
  }

  // Enumerate 2-hop and 3-hop paths as ontologyType sequences
  const pathCounts = new Map<string, { count: number; examples: Array<{ fromLabel: string; toLabel: string }> }>();

  for (const edge of edges) {
    const fromNode = nodeById.get(edge.fromNodeId);
    const toNode = nodeById.get(edge.toNodeId);
    if (!fromNode?.ontologyTypeId || !toNode?.ontologyTypeId) continue;

    // 2-hop: A → B
    const key2 = `${fromNode.ontologyTypeId}→${toNode.ontologyTypeId}`;
    if (!pathCounts.has(key2)) pathCounts.set(key2, { count: 0, examples: [] });
    const entry2 = pathCounts.get(key2)!;
    entry2.count++;
    if (entry2.examples.length < 3) {
      entry2.examples.push({ fromLabel: fromNode.label, toLabel: toNode.label });
    }

    // 3-hop: A → B → C
    const nextNodes = adjacency.get(edge.toNodeId);
    if (!nextNodes) continue;
    for (const nextId of nextNodes) {
      const nextNode = nodeById.get(nextId);
      if (!nextNode?.ontologyTypeId) continue;
      const key3 = `${fromNode.ontologyTypeId}→${toNode.ontologyTypeId}→${nextNode.ontologyTypeId}`;
      if (!pathCounts.has(key3)) pathCounts.set(key3, { count: 0, examples: [] });
      const entry3 = pathCounts.get(key3)!;
      entry3.count++;
      if (entry3.examples.length < 3) {
        entry3.examples.push({ fromLabel: fromNode.label, toLabel: nextNode.label });
      }
    }
  }

  // 빈도 2 이상만 반환, count 내림차순
  return [...pathCounts.entries()]
    .filter(([, v]) => v.count >= 2)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([key, v]) => ({
      path: key.split("→"),
      count: v.count,
      examples: v.examples,
    }));
}

// ============================================================================
// 2. detectContradictions — supports + contradicts 동시 존재 감지
// ============================================================================

export async function detectContradictions(
  db: DrizzleD1Database<Record<string, unknown>>,
  tenantId: string,
): Promise<ContradictionResult[]> {
  const discoveryIds = await getTenantDiscoveryIds(db, tenantId);
  if (discoveryIds.length === 0) return [];

  const nodes = await getActiveNodes(db, discoveryIds);
  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges = await getEdgesForNodes(db, nodeIds);
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  // globalEntityId 기준으로 노드를 그룹핑 (교차 Discovery 통합)
  // nodeId → canonical key (globalEntityId or nodeId)
  const canonicalKey = (nodeId: string): string => {
    const node = nodeById.get(nodeId);
    return node?.globalEntityId || nodeId;
  };

  // 방향 무관 쌍(canonicalA, canonicalB) 기준으로 supports/contradicts 엣지 수집
  type PairEdges = {
    supports: Array<{ id: string; strength: number; discoveryId: string }>;
    contradicts: Array<{ id: string; strength: number; discoveryId: string }>;
    nodeA: { id: string; label: string };
    nodeB: { id: string; label: string };
  };
  const pairMap = new Map<string, PairEdges>();

  for (const edge of edges) {
    if (edge.relationType !== "supports" && edge.relationType !== "contradicts") continue;

    const keyA = canonicalKey(edge.fromNodeId);
    const keyB = canonicalKey(edge.toNodeId);
    if (keyA === keyB) continue;

    // 정렬하여 방향 무관한 쌍 키 생성
    const pairKey = keyA < keyB ? `${keyA}::${keyB}` : `${keyB}::${keyA}`;

    if (!pairMap.has(pairKey)) {
      const nodeA = nodeById.get(edge.fromNodeId);
      const nodeB = nodeById.get(edge.toNodeId);
      pairMap.set(pairKey, {
        supports: [],
        contradicts: [],
        nodeA: { id: edge.fromNodeId, label: nodeA?.label || "" },
        nodeB: { id: edge.toNodeId, label: nodeB?.label || "" },
      });
    }

    const pair = pairMap.get(pairKey)!;
    const fromNode = nodeById.get(edge.fromNodeId);
    const discoveryId = fromNode?.discoveryId || "";

    if (edge.relationType === "supports") {
      pair.supports.push({ id: edge.id, strength: (edge.strength ?? 100) / 100, discoveryId });
    } else {
      pair.contradicts.push({ id: edge.id, strength: (edge.strength ?? 100) / 100, discoveryId });
    }
  }

  // supports와 contradicts 모두 존재하는 쌍만 반환
  return [...pairMap.values()]
    .filter((p) => p.supports.length > 0 && p.contradicts.length > 0)
    .map((p) => ({
      nodeA: p.nodeA,
      nodeB: p.nodeB,
      supportEdges: p.supports,
      contradictEdges: p.contradicts,
    }));
}

// ============================================================================
// 3. detectClusters — Union-Find 연결 컴포넌트 식별
// ============================================================================

export async function detectClusters(
  db: DrizzleD1Database<Record<string, unknown>>,
  tenantId: string,
): Promise<ClusterResult[]> {
  const discoveryIds = await getTenantDiscoveryIds(db, tenantId);
  if (discoveryIds.length === 0) return [];

  const nodes = await getActiveNodes(db, discoveryIds);
  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges = await getEdgesForNodes(db, nodeIds);

  // globalEntityId 기준으로 노드 통합 — 같은 globalEntityId는 같은 union에
  // canonical: globalEntityId || nodeId
  const canonical = (n: typeof nodes[0]) => n.globalEntityId || n.id;

  // Union-Find with path compression
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    if (!parent.has(x)) parent.set(x, x);
    if (parent.get(x) !== x) parent.set(x, find(parent.get(x)!));
    return parent.get(x)!;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  // 1. 같은 globalEntityId를 가진 노드끼리 union
  const byGlobal = new Map<string, string[]>();
  for (const node of nodes) {
    const c = canonical(node);
    find(c); // 초기화
    if (node.globalEntityId) {
      if (!byGlobal.has(node.globalEntityId)) byGlobal.set(node.globalEntityId, []);
      byGlobal.get(node.globalEntityId)!.push(c);
    }
  }
  for (const group of byGlobal.values()) {
    for (let i = 1; i < group.length; i++) union(group[0], group[i]);
  }

  // 2. 엣지로 연결된 노드끼리 union
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  for (const edge of edges) {
    const fromNode = nodeById.get(edge.fromNodeId);
    const toNode = nodeById.get(edge.toNodeId);
    if (!fromNode || !toNode) continue;
    union(canonical(fromNode), canonical(toNode));
  }

  // 3. 클러스터 수집
  const clusters = new Map<string, { nodeSet: Set<string>; edgeCount: number }>();
  for (const node of nodes) {
    const root = find(canonical(node));
    if (!clusters.has(root)) clusters.set(root, { nodeSet: new Set(), edgeCount: 0 });
    clusters.get(root)!.nodeSet.add(node.id);
  }

  // 엣지 수 집계
  for (const edge of edges) {
    const fromNode = nodeById.get(edge.fromNodeId);
    const toNode = nodeById.get(edge.toNodeId);
    if (!fromNode || !toNode) continue;
    const root = find(canonical(fromNode));
    const cluster = clusters.get(root);
    if (cluster) cluster.edgeCount++;
  }

  // 4. 결과 조립 (노드 2개 이상인 클러스터만)
  let clusterId = 0;
  return [...clusters.entries()]
    .filter(([, c]) => c.nodeSet.size >= 2)
    .sort((a, b) => b[1].nodeSet.size - a[1].nodeSet.size)
    .map(([, c]) => {
      const n = c.nodeSet.size;
      const maxEdges = n * (n - 1) / 2;
      return {
        clusterId: clusterId++,
        nodes: [...c.nodeSet].map((id) => {
          const node = nodeById.get(id)!;
          return { id: node.id, label: node.label, discoveryId: node.discoveryId };
        }),
        edgeCount: c.edgeCount,
        density: maxEdges > 0 ? Math.round((c.edgeCount / maxEdges) * 100) / 100 : 0,
      };
    });
}

// ============================================================================
// 4. analyzeCentrality — Degree centrality 기반 영향력 분석
// ============================================================================

export async function analyzeCentrality(
  db: DrizzleD1Database<Record<string, unknown>>,
  tenantId: string,
): Promise<CentralityResult[]> {
  const discoveryIds = await getTenantDiscoveryIds(db, tenantId);
  if (discoveryIds.length === 0) return [];

  const nodes = await getActiveNodes(db, discoveryIds);
  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges = await getEdgesForNodes(db, nodeIds);

  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  // ontologyType 이름 조회
  const types = await db
    .select({ id: ontologyTypes.id, nameKo: ontologyTypes.nameKo })
    .from(ontologyTypes);
  const typeNameById = new Map(types.map((t) => [t.id, t.nameKo]));

  // globalEntityId 기준 그룹핑
  type DegreeInfo = {
    globalEntityId: string;
    label: string;
    ontologyTypeId: string | null;
    inDegree: number;
    outDegree: number;
    discoveryIds: Set<string>;
  };

  const entityMap = new Map<string, DegreeInfo>();

  const getOrCreate = (node: typeof nodes[0]): DegreeInfo => {
    const key = node.globalEntityId || node.id;
    if (!entityMap.has(key)) {
      entityMap.set(key, {
        globalEntityId: key,
        label: node.label,
        ontologyTypeId: node.ontologyTypeId,
        inDegree: 0,
        outDegree: 0,
        discoveryIds: new Set(),
      });
    }
    const info = entityMap.get(key)!;
    info.discoveryIds.add(node.discoveryId);
    return info;
  };

  // 모든 노드 초기화
  for (const node of nodes) getOrCreate(node);

  // degree 집계
  for (const edge of edges) {
    const fromNode = nodeById.get(edge.fromNodeId);
    const toNode = nodeById.get(edge.toNodeId);
    if (!fromNode || !toNode) continue;

    const fromKey = fromNode.globalEntityId || fromNode.id;
    const toKey = toNode.globalEntityId || toNode.id;

    const fromInfo = entityMap.get(fromKey);
    const toInfo = entityMap.get(toKey);
    if (fromInfo) fromInfo.outDegree++;
    if (toInfo) toInfo.inDegree++;
  }

  // 상위 20개 반환 (totalDegree 내림차순)
  return [...entityMap.values()]
    .map((info) => ({
      globalEntityId: info.globalEntityId,
      label: info.label,
      ontologyType: (info.ontologyTypeId && typeNameById.get(info.ontologyTypeId)) || "unknown",
      inDegree: info.inDegree,
      outDegree: info.outDegree,
      totalDegree: info.inDegree + info.outDegree,
      discoveryCount: info.discoveryIds.size,
    }))
    .sort((a, b) => b.totalDegree - a.totalDegree)
    .slice(0, 20);
}
