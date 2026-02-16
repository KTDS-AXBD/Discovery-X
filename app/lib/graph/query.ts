import { eq, and, sql } from "drizzle-orm";
import { graphs } from "~/db/schema-v2";
import type { DB } from "~/db/index";
import type {
  GraphQueryEngineInterface,
  JsonLdNode,
  JsonLdGraph,
  ScopeFilter,
  SearchResult,
  ScopeType,
} from "./types";

/**
 * JSON-LD Graph 탐색 엔진
 *
 * Phase 1에서는 keyword 기반 검색을 사용하며,
 * FF_VECTORIZE_SEARCH 활성화 시 Vectorize 기반으로 교체 예정.
 */
export class GraphQueryEngine implements GraphQueryEngineInterface {
  constructor(private readonly db: DB) {}

  // ─── Public API ──────────────────────────────────────────────────────

  /** 특정 Graph 내에서 @id로 노드 찾기 */
  async get(graphId: string, nodeId: string): Promise<JsonLdNode | null> {
    const nodes = await this.parseJsonLd(await this.loadGraph(graphId));
    return nodes.find((n) => n["@id"] === nodeId) ?? null;
  }

  /**
   * @id URI 기반 관계 탐색 (BFS)
   *
   * 시작 노드에서 relation 키의 값(@id 문자열 또는 배열)을 따라
   * depth만큼 재귀 탐색한다. 모든 Graph를 대상으로 검색.
   */
  async traverse(
    startId: string,
    relation: string,
    depth = 1,
  ): Promise<JsonLdNode[]> {
    // 전체 그래프에서 모든 노드를 수집하고 @id → 노드 맵 구축
    const nodeMap = await this.buildGlobalNodeMap();

    const visited = new Set<string>();
    const result: JsonLdNode[] = [];
    let queue: string[] = [startId];

    for (let d = 0; d < depth && queue.length > 0; d++) {
      const nextQueue: string[] = [];

      for (const currentId of queue) {
        if (visited.has(currentId)) continue;
        visited.add(currentId);

        const node = nodeMap.get(currentId);
        if (!node) continue;

        // 시작 노드는 결과에 포함하지 않음
        if (currentId !== startId) {
          result.push(node);
        }

        // relation 키의 값에서 다음 탐색 대상 추출
        const related = node[relation];
        if (!related) continue;

        const ids = this.extractIds(related);
        for (const id of ids) {
          if (!visited.has(id)) {
            nextQueue.push(id);
          }
        }
      }

      queue = nextQueue;
    }

    // 마지막 depth의 queue에 남은 노드도 결과에 추가
    for (const id of queue) {
      if (!visited.has(id)) {
        const node = nodeMap.get(id);
        if (node) result.push(node);
        visited.add(id);
      }
    }

    return result;
  }

  /** @type 기반 필터링 — 해당 scope의 Graph에서 @type이 일치하는 노드 목록 */
  async findByType(
    scopeType: ScopeType,
    scopeId: string,
    type: string,
  ): Promise<JsonLdNode[]> {
    const raw = await this.loadGraphByScope(scopeType, scopeId);
    const nodes = await this.parseJsonLd(raw);
    return nodes.filter((n) => n["@type"] === type);
  }

  /**
   * D1 json_extract 활용 — 서버 사이드에서 JSON 경로 추출
   *
   * path 예시: "$.@graph[0].@type"
   */
  async extractPath(graphId: string, path: string): Promise<unknown> {
    const rows = await this.db
      .select({
        extracted: sql<string>`json_extract(${graphs.jsonld}, ${path})`,
      })
      .from(graphs)
      .where(eq(graphs.id, graphId));

    if (rows.length === 0) return null;

    const value = rows[0].extracted;

    // json_extract가 JSON 문자열을 반환할 수 있으므로 파싱 시도
    if (typeof value === "string") {
      try {
        return JSON.parse(value) as unknown;
      } catch {
        return value;
      }
    }

    return value;
  }

  /**
   * 시맨틱 검색 (Phase 1: keyword fallback)
   *
   * FF_VECTORIZE_SEARCH가 false이면 단순 keyword 포함 검사.
   * 향후 Vectorize 기반 벡터 유사도 검색으로 교체 예정.
   */
  async semanticSearch(
    query: string,
    scopeFilter?: ScopeFilter,
  ): Promise<SearchResult[]> {
    const graphRows = scopeFilter
      ? await this.db
          .select()
          .from(graphs)
          .where(
            and(
              eq(graphs.scopeType, scopeFilter.scopeType),
              eq(graphs.scopeId, scopeFilter.scopeId),
            ),
          )
      : await this.db.select().from(graphs);

    const results: SearchResult[] = [];
    const queryLower = query.toLowerCase();

    for (const row of graphRows) {
      const nodes = await this.parseJsonLd(row.jsonld);
      for (const node of nodes) {
        if (this.nodeContainsQuery(node, queryLower)) {
          results.push({
            node,
            score: 1.0, // Phase 1: 단순 포함 = 1.0
            source: {
              scopeType: row.scopeType as ScopeType,
              scopeId: row.scopeId,
            },
          });
        }
      }
    }

    return results;
  }

  // ─── Internal Helpers ────────────────────────────────────────────────

  /** graphs 테이블에서 ID로 조회 — jsonld 문자열 반환 */
  private async loadGraph(graphId: string): Promise<string | null> {
    const rows = await this.db
      .select({ jsonld: graphs.jsonld })
      .from(graphs)
      .where(eq(graphs.id, graphId));

    return rows.length > 0 ? rows[0].jsonld : null;
  }

  /** scope로 조회 — jsonld 문자열 반환 */
  private async loadGraphByScope(
    scopeType: ScopeType,
    scopeId: string,
  ): Promise<string | null> {
    const rows = await this.db
      .select({ jsonld: graphs.jsonld })
      .from(graphs)
      .where(
        and(eq(graphs.scopeType, scopeType), eq(graphs.scopeId, scopeId)),
      );

    return rows.length > 0 ? rows[0].jsonld : null;
  }

  /** JSON 파싱 + @graph 배열 반환 */
  private async parseJsonLd(raw: string | null): Promise<JsonLdNode[]> {
    if (!raw) return [];

    try {
      const parsed = JSON.parse(raw) as JsonLdGraph;
      return Array.isArray(parsed["@graph"]) ? parsed["@graph"] : [];
    } catch {
      return [];
    }
  }

  /** 전체 그래프의 모든 노드를 @id → JsonLdNode 맵으로 구축 */
  private async buildGlobalNodeMap(): Promise<Map<string, JsonLdNode>> {
    const allRows = await this.db.select({ jsonld: graphs.jsonld }).from(graphs);
    const nodeMap = new Map<string, JsonLdNode>();

    for (const row of allRows) {
      const nodes = await this.parseJsonLd(row.jsonld);
      for (const node of nodes) {
        nodeMap.set(node["@id"], node);
      }
    }

    return nodeMap;
  }

  /**
   * relation 값에서 @id 문자열 추출
   *
   * JSON-LD에서 관계 값은 다양한 형태로 올 수 있음:
   * - 문자열: "dx:node-123"
   * - 객체: { "@id": "dx:node-123" }
   * - 배열: ["dx:node-123", { "@id": "dx:node-456" }]
   */
  private extractIds(value: unknown): string[] {
    if (typeof value === "string") return [value];

    if (Array.isArray(value)) {
      return value.flatMap((v) => this.extractIds(v));
    }

    if (typeof value === "object" && value !== null && "@id" in value) {
      const id = (value as Record<string, unknown>)["@id"];
      if (typeof id === "string") return [id];
    }

    return [];
  }

  /** 노드의 모든 문자열 값에서 query 포함 여부를 재귀 검사 */
  private nodeContainsQuery(node: JsonLdNode, queryLower: string): boolean {
    return this.containsInValue(node, queryLower);
  }

  /** 재귀적으로 값을 탐색하며 query 포함 여부 확인 */
  private containsInValue(value: unknown, queryLower: string): boolean {
    if (typeof value === "string") {
      return value.toLowerCase().includes(queryLower);
    }

    if (Array.isArray(value)) {
      return value.some((v) => this.containsInValue(v, queryLower));
    }

    if (typeof value === "object" && value !== null) {
      return Object.values(value).some((v) =>
        this.containsInValue(v, queryLower),
      );
    }

    return false;
  }
}
