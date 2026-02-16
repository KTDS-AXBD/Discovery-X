/**
 * Graph 노드 Vectorize 어댑터
 *
 * Graph JSON-LD 노드를 임베딩하여 Cloudflare Vectorize에 인덱싱하고,
 * 시맨틱 검색을 수행한다.
 *
 * 의존: OPENAI_API_KEY (text-embedding-3-small), VECTORIZE_GRAPHS 바인딩
 * Phase 4: FF_VECTORIZE_SEARCH Feature Flag로 점진 활성화
 */

import type { JsonLdGraph, JsonLdNode } from "./types";

// ─── Vectorize 인터페이스 (Cloudflare 바인딩 타입) ───────────────────

export interface VectorizeIndex {
  upsert(
    vectors: {
      id: string;
      values: number[];
      metadata?: Record<string, string>;
    }[],
  ): Promise<{ mutationId: string }>;
  query(
    vector: number[],
    options?: {
      topK?: number;
      filter?: Record<string, string>;
      returnMetadata?: boolean;
    },
  ): Promise<{
    matches: {
      id: string;
      score: number;
      metadata?: Record<string, string>;
    }[];
  }>;
}

export interface VectorizeGraphEnv {
  OPENAI_API_KEY: string;
  VECTORIZE_GRAPHS?: VectorizeIndex;
  VECTORIZE_MEMORY?: VectorizeIndex;
  VECTORIZE_SIGNALS?: VectorizeIndex;
}

export interface VectorizeSearchResult {
  id: string;
  score: number;
  metadata?: Record<string, string>;
}

// ─── GraphVectorizeAdapter ───────────────────────────────────────────

export class GraphVectorizeAdapter {
  constructor(private env: VectorizeGraphEnv) {}

  /** Vectorize 바인딩이 설정되어 있는지 확인 */
  isAvailable(): boolean {
    return !!this.env.VECTORIZE_GRAPHS && !!this.env.OPENAI_API_KEY;
  }

  /**
   * OpenAI text-embedding-3-small로 텍스트 임베딩 생성
   * dimensions: 512 (비용 절감)
   */
  async generateEmbedding(text: string): Promise<number[]> {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: text.slice(0, 8000), // 입력 길이 제한
        dimensions: 512,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI embedding API 오류: ${response.status} ${err}`);
    }

    const data = (await response.json()) as {
      data: { embedding: number[] }[];
    };

    return data.data[0].embedding;
  }

  /**
   * Graph 노드를 Vectorize에 upsert
   * ID 형식: `{graphId}:{nodeId}`
   */
  async indexGraphNode(
    graphId: string,
    scopeType: string,
    scopeId: string,
    node: JsonLdNode,
  ): Promise<void> {
    if (!this.env.VECTORIZE_GRAPHS) return;

    const text = this.nodeToText(node);
    if (!text) return;

    const embedding = await this.generateEmbedding(text);
    const vectorId = `${graphId}:${node["@id"]}`;

    await this.env.VECTORIZE_GRAPHS.upsert([
      {
        id: vectorId,
        values: embedding,
        metadata: {
          graphId,
          scopeType,
          scopeId,
          nodeType: String(node["@type"] ?? "unknown"),
          nodeId: node["@id"],
        },
      },
    ]);
  }

  /**
   * Graph 전체 노드를 인덱싱
   * @returns 인덱싱된 노드 수
   */
  async indexGraph(
    graphId: string,
    scopeType: string,
    scopeId: string,
    jsonld: JsonLdGraph,
  ): Promise<number> {
    if (!this.env.VECTORIZE_GRAPHS) return 0;

    let indexed = 0;
    const graphNodes = jsonld["@graph"] ?? [];

    for (const node of graphNodes) {
      try {
        await this.indexGraphNode(graphId, scopeType, scopeId, node);
        indexed++;
      } catch (err) {
        console.error(
          `[vectorize-adapter] 노드 인덱싱 실패: ${node["@id"]}`,
          err,
        );
      }
    }

    return indexed;
  }

  /**
   * 시맨틱 검색 — query 텍스트로 유사 Graph 노드 검색
   */
  async search(
    query: string,
    options?: { topK?: number; scopeType?: string; scopeId?: string },
  ): Promise<VectorizeSearchResult[]> {
    if (!this.env.VECTORIZE_GRAPHS) return [];

    const embedding = await this.generateEmbedding(query);

    const filter: Record<string, string> = {};
    if (options?.scopeType) filter.scopeType = options.scopeType;
    if (options?.scopeId) filter.scopeId = options.scopeId;

    const result = await this.env.VECTORIZE_GRAPHS.query(embedding, {
      topK: options?.topK ?? 10,
      filter: Object.keys(filter).length > 0 ? filter : undefined,
      returnMetadata: true,
    });

    return result.matches;
  }

  // ─── Agent Memory 인덱싱 ──────────────────────────────────────────

  /**
   * Agent Memory를 Vectorize에 인덱싱
   * namespace: VECTORIZE_MEMORY
   */
  async indexMemory(
    memoryId: number,
    userId: string,
    memoryType: string,
    content: string,
    category?: string | null,
  ): Promise<void> {
    if (!this.env.VECTORIZE_MEMORY) return;

    const embedding = await this.generateEmbedding(content);

    await this.env.VECTORIZE_MEMORY.upsert([
      {
        id: `mem:${memoryId}`,
        values: embedding,
        metadata: {
          userId,
          memoryType,
          category: category ?? "uncategorized",
        },
      },
    ]);
  }

  /**
   * Agent Memory 시맨틱 검색
   */
  async searchMemory(
    query: string,
    userId: string,
    options?: { topK?: number; memoryType?: string },
  ): Promise<VectorizeSearchResult[]> {
    if (!this.env.VECTORIZE_MEMORY) return [];

    const embedding = await this.generateEmbedding(query);
    const filter: Record<string, string> = { userId };
    if (options?.memoryType) filter.memoryType = options.memoryType;

    const result = await this.env.VECTORIZE_MEMORY.query(embedding, {
      topK: options?.topK ?? 5,
      filter,
      returnMetadata: true,
    });

    return result.matches;
  }

  // ─── Signal 인덱싱 ──────────────────────────────────────────────

  /**
   * Shared Signal을 Vectorize에 인덱싱
   * namespace: VECTORIZE_SIGNALS
   */
  async indexSignal(
    signalId: number,
    teamId: string,
    topicId: string | null,
    contentSummary: string,
  ): Promise<void> {
    if (!this.env.VECTORIZE_SIGNALS) return;

    const embedding = await this.generateEmbedding(contentSummary);

    await this.env.VECTORIZE_SIGNALS.upsert([
      {
        id: `sig:${signalId}`,
        values: embedding,
        metadata: {
          teamId,
          topicId: topicId ?? "",
        },
      },
    ]);
  }

  /**
   * Signal 시맨틱 검색 — 유사 시그널 찾기
   */
  async searchSignals(
    query: string,
    options?: { topK?: number; teamId?: string; topicId?: string },
  ): Promise<VectorizeSearchResult[]> {
    if (!this.env.VECTORIZE_SIGNALS) return [];

    const embedding = await this.generateEmbedding(query);
    const filter: Record<string, string> = {};
    if (options?.teamId) filter.teamId = options.teamId;
    if (options?.topicId) filter.topicId = options.topicId;

    const result = await this.env.VECTORIZE_SIGNALS.query(embedding, {
      topK: options?.topK ?? 10,
      filter: Object.keys(filter).length > 0 ? filter : undefined,
      returnMetadata: true,
    });

    return result.matches;
  }

  // ─── 내부 헬퍼 ──────────────────────────────────────────────────────

  /**
   * JSON-LD 노드에서 임베딩용 텍스트 추출
   * @type + 모든 문자열 값을 연결
   */
  private nodeToText(node: JsonLdNode): string {
    const parts: string[] = [];

    for (const [key, value] of Object.entries(node)) {
      if (key === "@id") continue; // ID는 의미 없으므로 제외
      if (typeof value === "string") {
        parts.push(value);
      } else if (Array.isArray(value)) {
        for (const item of value) {
          if (typeof item === "string") {
            parts.push(item);
          }
        }
      }
    }

    return parts.join(" ").trim();
  }
}
