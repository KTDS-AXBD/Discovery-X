/**
 * Ontology Intelligence — Phase 3 시뮬레이션 엔진
 *
 * 3개 시뮬레이션 알고리즘:
 * 1. propagateInfluence  — BFS 기반 영향 전파 시뮬레이션
 * 2. generateScenario    — LLM 시나리오 분석 (Claude Haiku)
 * 3. compareSnapshots    — 단계별 스냅샷 비교 (diff)
 */

import { eq, and, inArray, ne } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { contextNodes, contextEdges, contextSnapshots, discoveries, ontologyTypes } from "~/db";
import { callLLM } from "~/lib/ai";
import type { FallbackContext } from "~/lib/ai";

// --- Result Types ---

export interface PropagationOptions {
  maxDepth?: number;      // default 3
  decayFactor?: number;   // default 0.7
  minImpact?: number;     // threshold to stop, default 0.01
}

export interface AffectedNode {
  nodeId: string;
  globalEntityId: string | null;
  label: string;
  ontologyType: string;
  impact: number;         // 0.0 ~ 1.0
  depth: number;          // hops from source
  path: string[];         // node IDs from source to this node
}

export interface PropagationResult {
  sourceNode: { id: string; label: string; ontologyType: string };
  magnitude: number;
  affectedNodes: AffectedNode[];
  totalNodes: number;
  maxDepthReached: number;
}

export interface ScenarioResult {
  summary: string;
  impacts: Array<{
    entity: string;
    impact: string;
    probability: "high" | "medium" | "low";
    timeframe: string;
  }>;
  risks: string[];
  opportunities: string[];
  recommendation: string;
}

export interface SnapshotDiff {
  discoveryId: string;
  stageA: string;
  stageB: string;
  addedNodes: Array<{ id: string; label: string }>;
  removedNodes: Array<{ id: string; label: string }>;
  addedEdges: Array<{ fromLabel: string; toLabel: string; relationType: string }>;
  removedEdges: Array<{ fromLabel: string; toLabel: string; relationType: string }>;
  summary: string;
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

/** 노드 ID 집합에 연결된 엣지 조회 (양방향) */
async function getEdgesForNodes(
  db: DrizzleD1Database<Record<string, unknown>>,
  nodeIds: Set<string>,
) {
  if (nodeIds.size === 0) return [];
  const nodeIdArr = [...nodeIds];

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

  // Deduplicate by edge id — 양쪽 끝 모두 active 노드에 속해야 함
  const edgeMap = new Map<string, (typeof allEdges)[0]>();
  for (const e of [...allEdges, ...reverseEdges]) {
    if (nodeIds.has(e.fromNodeId) && nodeIds.has(e.toNodeId)) {
      edgeMap.set(e.id, e);
    }
  }
  return [...edgeMap.values()];
}

// ============================================================================
// 1. propagateInfluence — BFS 기반 영향 전파 시뮬레이션
// ============================================================================

export async function propagateInfluence(
  db: DrizzleD1Database<Record<string, unknown>>,
  tenantId: string,
  sourceNodeId: string,
  magnitude: number,
  options?: PropagationOptions,
): Promise<PropagationResult> {
  const maxDepth = options?.maxDepth ?? 3;
  const decayFactor = options?.decayFactor ?? 0.7;
  const minImpact = options?.minImpact ?? 0.01;

  // 1. 테넌트 소속 노드 · 엣지 조회
  const discoveryIds = await getTenantDiscoveryIds(db, tenantId);
  const nodes = await getActiveNodes(db, discoveryIds);
  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges = await getEdgesForNodes(db, nodeIds);

  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  // ontologyType 이름 조회
  const types = await db
    .select({ id: ontologyTypes.id, nameKo: ontologyTypes.nameKo })
    .from(ontologyTypes);
  const typeNameById = new Map(types.map((t) => [t.id, t.nameKo]));

  // 소스 노드 검증
  const sourceNode = nodeById.get(sourceNodeId);
  if (!sourceNode) {
    return {
      sourceNode: { id: sourceNodeId, label: "unknown", ontologyType: "unknown" },
      magnitude,
      affectedNodes: [],
      totalNodes: 0,
      maxDepthReached: 0,
    };
  }

  // 2. 인접 리스트 구성 (양방향 — 영향은 엣지 방향과 무관하게 전파)
  const adjacency = new Map<string, Array<{ neighborId: string; strength: number }>>();
  for (const edge of edges) {
    // from → to
    if (!adjacency.has(edge.fromNodeId)) adjacency.set(edge.fromNodeId, []);
    adjacency.get(edge.fromNodeId)!.push({
      neighborId: edge.toNodeId,
      strength: edge.strength ?? 100,
    });
    // to → from (양방향)
    if (!adjacency.has(edge.toNodeId)) adjacency.set(edge.toNodeId, []);
    adjacency.get(edge.toNodeId)!.push({
      neighborId: edge.fromNodeId,
      strength: edge.strength ?? 100,
    });
  }

  // 3. BFS 전파
  const visited = new Set<string>([sourceNodeId]);
  const affectedNodes: AffectedNode[] = [];
  let maxDepthReached = 0;

  // queue: [nodeId, currentImpact, depth, path]
  const queue: Array<[string, number, number, string[]]> = [
    [sourceNodeId, magnitude, 0, [sourceNodeId]],
  ];

  while (queue.length > 0) {
    const [currentId, currentImpact, depth, path] = queue.shift()!;

    if (depth > 0) {
      const node = nodeById.get(currentId)!;
      affectedNodes.push({
        nodeId: currentId,
        globalEntityId: node.globalEntityId,
        label: node.label,
        ontologyType: (node.ontologyTypeId && typeNameById.get(node.ontologyTypeId)) || "unknown",
        impact: currentImpact,
        depth,
        path,
      });
      if (depth > maxDepthReached) maxDepthReached = depth;
    }

    if (depth >= maxDepth) continue;

    const neighbors = adjacency.get(currentId) || [];
    for (const { neighborId, strength } of neighbors) {
      if (visited.has(neighborId)) continue;
      visited.add(neighborId);

      const newImpact = currentImpact * (strength / 100) * decayFactor;
      if (newImpact < minImpact) continue;

      queue.push([neighborId, newImpact, depth + 1, [...path, neighborId]]);
    }
  }

  // 4. impact 내림차순 정렬
  affectedNodes.sort((a, b) => b.impact - a.impact);

  return {
    sourceNode: {
      id: sourceNode.id,
      label: sourceNode.label,
      ontologyType: (sourceNode.ontologyTypeId && typeNameById.get(sourceNode.ontologyTypeId)) || "unknown",
    },
    magnitude,
    affectedNodes,
    totalNodes: affectedNodes.length,
    maxDepthReached,
  };
}

// ============================================================================
// 2. generateScenario — LLM 시나리오 분석
// ============================================================================

const SCENARIO_SYSTEM_PROMPT = `당신은 비즈니스 전략 시나리오 분석가입니다.
주어진 영향 전파 결과와 질문을 바탕으로 시나리오를 분석하세요.

## 응답 형식 (JSON만 출력)
{
  "summary": "1-2문장 요약",
  "impacts": [
    { "entity": "영향 받는 엔티티", "impact": "영향 설명", "probability": "high|medium|low", "timeframe": "시간 범위" }
  ],
  "risks": ["리스크1", "리스크2"],
  "opportunities": ["기회1", "기회2"],
  "recommendation": "권고사항"
}`;

export async function generateScenario(
  apiKey: string,
  propagationResult: PropagationResult,
  question: string,
  aiCtx?: FallbackContext,
): Promise<ScenarioResult> {
  const contextStr = propagationResult.affectedNodes
    .map((n) => `- ${n.label} (${n.ontologyType}): 영향도 ${(n.impact * 100).toFixed(1)}%, 깊이 ${n.depth}`)
    .join("\n");

  const userMessage = `## 소스 노드
${propagationResult.sourceNode.label} (${propagationResult.sourceNode.ontologyType})
영향 크기: ${propagationResult.magnitude}

## 영향 받는 노드 (${propagationResult.totalNodes}개)
${contextStr || "(없음)"}

## 질문
${question}`;

  const parseResponse = (text: string): ScenarioResult => {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found");
    const parsed = JSON.parse(jsonMatch[0]) as ScenarioResult;

    // 기본 검증
    if (!parsed.summary) parsed.summary = "";
    if (!Array.isArray(parsed.impacts)) parsed.impacts = [];
    if (!Array.isArray(parsed.risks)) parsed.risks = [];
    if (!Array.isArray(parsed.opportunities)) parsed.opportunities = [];
    if (!parsed.recommendation) parsed.recommendation = "";

    return parsed;
  };

  // 1차 시도
  try {
    const response = await callLLM(apiKey, {
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      system: SCENARIO_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    }, aiCtx);

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    return parseResponse(text);
  } catch {
    // 1회 재시도
    try {
      const response = await callLLM(apiKey, {
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2048,
        system: SCENARIO_SYSTEM_PROMPT + "\n\n중요: 반드시 유효한 JSON만 출력하세요.",
        messages: [{ role: "user", content: userMessage }],
      }, aiCtx);

      const text = response.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");

      return parseResponse(text);
    } catch {
      return {
        summary: "시나리오 생성 실패",
        impacts: [],
        risks: [],
        opportunities: [],
        recommendation: "다시 시도해 주세요.",
      };
    }
  }
}

// ============================================================================
// 3. compareSnapshots — 단계별 스냅샷 비교
// ============================================================================

export async function compareSnapshots(
  db: DrizzleD1Database<Record<string, unknown>>,
  discoveryId: string,
  stageA: string,
  stageB: string,
): Promise<SnapshotDiff> {
  // 두 스냅샷 조회
  const snapshots = await db
    .select()
    .from(contextSnapshots)
    .where(
      and(
        eq(contextSnapshots.discoveryId, discoveryId),
      ),
    );

  const snapA = snapshots.find((s) => s.stage === stageA);
  const snapB = snapshots.find((s) => s.stage === stageB);

  const nodesA = (snapA?.snapshotData?.nodes ?? []) as Array<{ id: string; label: string }>;
  const nodesB = (snapB?.snapshotData?.nodes ?? []) as Array<{ id: string; label: string }>;
  const edgesA = (snapA?.snapshotData?.edges ?? []) as Array<{ fromLabel: string; toLabel: string; relationType: string }>;
  const edgesB = (snapB?.snapshotData?.edges ?? []) as Array<{ fromLabel: string; toLabel: string; relationType: string }>;

  // 노드 비교 (id 기준)
  const nodeIdsA = new Set(nodesA.map((n) => n.id));
  const nodeIdsB = new Set(nodesB.map((n) => n.id));

  const addedNodes = nodesB.filter((n) => !nodeIdsA.has(n.id)).map((n) => ({ id: n.id, label: n.label }));
  const removedNodes = nodesA.filter((n) => !nodeIdsB.has(n.id)).map((n) => ({ id: n.id, label: n.label }));

  // 엣지 비교 (fromLabel+toLabel+relationType 복합 키)
  const edgeKey = (e: { fromLabel: string; toLabel: string; relationType: string }) =>
    `${e.fromLabel}::${e.toLabel}::${e.relationType}`;

  const edgeKeysA = new Set(edgesA.map(edgeKey));
  const edgeKeysB = new Set(edgesB.map(edgeKey));

  const addedEdges = edgesB
    .filter((e) => !edgeKeysA.has(edgeKey(e)))
    .map((e) => ({ fromLabel: e.fromLabel, toLabel: e.toLabel, relationType: e.relationType }));
  const removedEdges = edgesA
    .filter((e) => !edgeKeysB.has(edgeKey(e)))
    .map((e) => ({ fromLabel: e.fromLabel, toLabel: e.toLabel, relationType: e.relationType }));

  // 요약 문자열
  const parts: string[] = [];
  if (addedNodes.length > 0) parts.push(`+${addedNodes.length} nodes`);
  if (removedNodes.length > 0) parts.push(`-${removedNodes.length} nodes`);
  if (addedEdges.length > 0) parts.push(`+${addedEdges.length} edges`);
  if (removedEdges.length > 0) parts.push(`-${removedEdges.length} edges`);

  return {
    discoveryId,
    stageA,
    stageB,
    addedNodes,
    removedNodes,
    addedEdges,
    removedEdges,
    summary: parts.length > 0 ? parts.join(", ") : "no changes",
  };
}
