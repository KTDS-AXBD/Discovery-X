/**
 * GraphVectorizeAdapter 테스트
 *
 * 테스트 대상:
 * - isAvailable(): 바인딩/키 존재 여부에 따른 가용성 판단
 * - generateEmbedding(): OpenAI API 호출 + 에러 처리 + 입력 truncate
 * - indexGraphNode() / indexGraph(): Graph 노드 벡터 인덱싱
 * - search(): 시맨틱 검색 + 필터 적용
 * - indexMemory() / searchMemory(): Memory 인덱싱/검색
 * - indexSignal() / searchSignals(): Signal 인덱싱/검색
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  GraphVectorizeAdapter,
  type VectorizeIndex,
  type VectorizeGraphEnv,
} from "~/lib/graph/vectorize-adapter";
import type { JsonLdGraph, JsonLdNode } from "~/lib/graph/types";

// ─── Mock 헬퍼 ──────────────────────────────────────────────────────────

function make512Vector(seed = 0.1): number[] {
  return Array.from({ length: 512 }, (_, i) => seed + i * 0.001);
}

function mockVectorizeIndex(): VectorizeIndex {
  return {
    upsert: vi.fn().mockResolvedValue({ mutationId: "mut-1" }),
    query: vi.fn().mockResolvedValue({ matches: [] }),
  };
}

function mockFetchSuccess(embedding: number[] = make512Vector()): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [{ embedding }] }),
      text: () => Promise.resolve(""),
    }),
  );
}

function mockFetchFailure(status = 500, body = "Internal Server Error"): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      status,
      text: () => Promise.resolve(body),
    }),
  );
}

function makeNode(overrides: Record<string, unknown> = {}): JsonLdNode {
  return {
    "@id": "dx:node-1",
    "@type": "dx:Observation",
    "dx:content": "관찰 내용",
    ...overrides,
  };
}

function makeGraph(nodes: JsonLdNode[] = [makeNode()]): JsonLdGraph {
  return {
    "@context": { dx: "https://discovery-x.io/ns/" },
    "@graph": nodes,
  };
}

// ─── 테스트 ─────────────────────────────────────────────────────────────

describe("GraphVectorizeAdapter", () => {
  let graphsIndex: VectorizeIndex;
  let memoryIndex: VectorizeIndex;
  let signalsIndex: VectorizeIndex;

  beforeEach(() => {
    vi.restoreAllMocks();
    graphsIndex = mockVectorizeIndex();
    memoryIndex = mockVectorizeIndex();
    signalsIndex = mockVectorizeIndex();
  });

  // ─── isAvailable ────────────────────────────────────────────────────

  describe("isAvailable", () => {
    it("VECTORIZE_GRAPHS + OPENAI_API_KEY 있으면 true", () => {
      const adapter = new GraphVectorizeAdapter({
        OPENAI_API_KEY: "sk-test",
        VECTORIZE_GRAPHS: graphsIndex,
      });

      expect(adapter.isAvailable()).toBe(true);
    });

    it("VECTORIZE_GRAPHS 없으면 false", () => {
      const adapter = new GraphVectorizeAdapter({
        OPENAI_API_KEY: "sk-test",
      });

      expect(adapter.isAvailable()).toBe(false);
    });

    it("OPENAI_API_KEY 없으면 false", () => {
      const adapter = new GraphVectorizeAdapter({
        OPENAI_API_KEY: "",
        VECTORIZE_GRAPHS: graphsIndex,
      });

      expect(adapter.isAvailable()).toBe(false);
    });
  });

  // ─── generateEmbedding ──────────────────────────────────────────────

  describe("generateEmbedding", () => {
    it("OpenAI API 호출 성공 시 512차원 벡터 반환", async () => {
      const expected = make512Vector();
      mockFetchSuccess(expected);

      const adapter = new GraphVectorizeAdapter({
        OPENAI_API_KEY: "sk-test",
        VECTORIZE_GRAPHS: graphsIndex,
      });

      const result = await adapter.generateEmbedding("테스트 텍스트");

      expect(result).toEqual(expected);
      expect(result).toHaveLength(512);
      expect(fetch).toHaveBeenCalledWith(
        "https://api.openai.com/v1/embeddings",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer sk-test",
          }),
        }),
      );
    });

    it("OpenAI API 실패 시 에러 throw", async () => {
      mockFetchFailure(429, "Rate limit exceeded");

      const adapter = new GraphVectorizeAdapter({
        OPENAI_API_KEY: "sk-test",
        VECTORIZE_GRAPHS: graphsIndex,
      });

      await expect(adapter.generateEmbedding("텍스트")).rejects.toThrow(
        "OpenAI embedding API 오류: 429 Rate limit exceeded",
      );
    });

    it("8000자 넘는 입력은 자동 truncate", async () => {
      mockFetchSuccess();

      const adapter = new GraphVectorizeAdapter({
        OPENAI_API_KEY: "sk-test",
        VECTORIZE_GRAPHS: graphsIndex,
      });

      const longText = "가".repeat(10000);
      await adapter.generateEmbedding(longText);

      const fetchCall = vi.mocked(fetch).mock.calls[0];
      const body = JSON.parse(fetchCall[1]!.body as string) as {
        input: string;
      };
      expect(body.input).toHaveLength(8000);
    });
  });

  // ─── indexGraphNode ─────────────────────────────────────────────────

  describe("indexGraphNode", () => {
    it("노드를 벡터화하여 upsert 호출", async () => {
      mockFetchSuccess();

      const adapter = new GraphVectorizeAdapter({
        OPENAI_API_KEY: "sk-test",
        VECTORIZE_GRAPHS: graphsIndex,
      });

      const node = makeNode({
        "@id": "dx:obs-1",
        "@type": "dx:Observation",
        "dx:content": "시장 변화 관찰",
      });

      await adapter.indexGraphNode("graph-1", "topic", "topic-1", node);

      expect(graphsIndex.upsert).toHaveBeenCalledWith([
        expect.objectContaining({
          id: "graph-1:dx:obs-1",
          values: expect.any(Array),
          metadata: {
            graphId: "graph-1",
            scopeType: "topic",
            scopeId: "topic-1",
            nodeType: "dx:Observation",
            nodeId: "dx:obs-1",
          },
        }),
      ]);
    });

    it("VECTORIZE_GRAPHS 없으면 skip", async () => {
      const adapter = new GraphVectorizeAdapter({
        OPENAI_API_KEY: "sk-test",
      });

      // fetch가 호출되지 않아야 함
      mockFetchSuccess();
      await adapter.indexGraphNode("g1", "user", "u1", makeNode());

      expect(fetch).not.toHaveBeenCalled();
    });
  });

  // ─── indexGraph ─────────────────────────────────────────────────────

  describe("indexGraph", () => {
    it("여러 노드 일괄 인덱싱 + 인덱싱 수 반환", async () => {
      mockFetchSuccess();

      const adapter = new GraphVectorizeAdapter({
        OPENAI_API_KEY: "sk-test",
        VECTORIZE_GRAPHS: graphsIndex,
      });

      const nodes: JsonLdNode[] = [
        makeNode({ "@id": "dx:n1", "dx:label": "노드1" }),
        makeNode({ "@id": "dx:n2", "dx:label": "노드2" }),
        makeNode({ "@id": "dx:n3", "dx:label": "노드3" }),
      ];

      const count = await adapter.indexGraph(
        "graph-2",
        "topic",
        "topic-2",
        makeGraph(nodes),
      );

      expect(count).toBe(3);
      expect(graphsIndex.upsert).toHaveBeenCalledTimes(3);
    });

    it("VECTORIZE_GRAPHS 없으면 0 반환", async () => {
      const adapter = new GraphVectorizeAdapter({
        OPENAI_API_KEY: "sk-test",
      });

      const count = await adapter.indexGraph(
        "g1",
        "user",
        "u1",
        makeGraph(),
      );
      expect(count).toBe(0);
    });
  });

  // ─── search ─────────────────────────────────────────────────────────

  describe("search", () => {
    it("query 벡터로 검색 + filter 적용", async () => {
      mockFetchSuccess();

      const matches = [
        { id: "g1:dx:n1", score: 0.95, metadata: { nodeType: "dx:Obs" } },
        { id: "g1:dx:n2", score: 0.87, metadata: { nodeType: "dx:Idea" } },
      ];
      vi.mocked(graphsIndex.query).mockResolvedValue({ matches });

      const adapter = new GraphVectorizeAdapter({
        OPENAI_API_KEY: "sk-test",
        VECTORIZE_GRAPHS: graphsIndex,
      });

      const results = await adapter.search("시장 트렌드", {
        topK: 5,
        scopeType: "topic",
        scopeId: "topic-1",
      });

      expect(results).toEqual(matches);
      expect(graphsIndex.query).toHaveBeenCalledWith(expect.any(Array), {
        topK: 5,
        filter: { scopeType: "topic", scopeId: "topic-1" },
        returnMetadata: true,
      });
    });

    it("VECTORIZE_GRAPHS 없으면 빈 배열 반환", async () => {
      const adapter = new GraphVectorizeAdapter({
        OPENAI_API_KEY: "sk-test",
      });

      const results = await adapter.search("검색어");
      expect(results).toEqual([]);
    });
  });

  // ─── indexMemory ────────────────────────────────────────────────────

  describe("indexMemory", () => {
    it("Memory를 VECTORIZE_MEMORY에 인덱싱", async () => {
      mockFetchSuccess();

      const adapter = new GraphVectorizeAdapter({
        OPENAI_API_KEY: "sk-test",
        VECTORIZE_MEMORY: memoryIndex,
      });

      await adapter.indexMemory(
        42,
        "user-1",
        "preference",
        "사용자는 기술 분석을 선호한다",
        "analysis",
      );

      expect(memoryIndex.upsert).toHaveBeenCalledWith([
        expect.objectContaining({
          id: "mem:42",
          values: expect.any(Array),
          metadata: {
            userId: "user-1",
            memoryType: "preference",
            category: "analysis",
          },
        }),
      ]);
    });

    it("VECTORIZE_MEMORY 없으면 skip", async () => {
      mockFetchSuccess();

      const adapter = new GraphVectorizeAdapter({
        OPENAI_API_KEY: "sk-test",
      });

      await adapter.indexMemory(1, "u1", "fact", "내용");
      expect(fetch).not.toHaveBeenCalled();
    });

    it("category가 null이면 'uncategorized'로 저장", async () => {
      mockFetchSuccess();

      const adapter = new GraphVectorizeAdapter({
        OPENAI_API_KEY: "sk-test",
        VECTORIZE_MEMORY: memoryIndex,
      });

      await adapter.indexMemory(10, "user-2", "fact", "무분류 메모", null);

      expect(memoryIndex.upsert).toHaveBeenCalledWith([
        expect.objectContaining({
          metadata: expect.objectContaining({
            category: "uncategorized",
          }),
        }),
      ]);
    });
  });

  // ─── searchMemory ──────────────────────────────────────────────────

  describe("searchMemory", () => {
    it("Memory 시맨틱 검색 — userId 필터", async () => {
      mockFetchSuccess();

      const matches = [
        { id: "mem:1", score: 0.92, metadata: { userId: "u1" } },
      ];
      vi.mocked(memoryIndex.query).mockResolvedValue({ matches });

      const adapter = new GraphVectorizeAdapter({
        OPENAI_API_KEY: "sk-test",
        VECTORIZE_MEMORY: memoryIndex,
      });

      const results = await adapter.searchMemory("기술 선호", "u1", {
        topK: 3,
        memoryType: "preference",
      });

      expect(results).toEqual(matches);
      expect(memoryIndex.query).toHaveBeenCalledWith(expect.any(Array), {
        topK: 3,
        filter: { userId: "u1", memoryType: "preference" },
        returnMetadata: true,
      });
    });

    it("VECTORIZE_MEMORY 없으면 빈 배열 반환", async () => {
      const adapter = new GraphVectorizeAdapter({
        OPENAI_API_KEY: "sk-test",
      });

      const results = await adapter.searchMemory("쿼리", "u1");
      expect(results).toEqual([]);
    });
  });

  // ─── indexSignal ────────────────────────────────────────────────────

  describe("indexSignal", () => {
    it("Signal을 VECTORIZE_SIGNALS에 인덱싱", async () => {
      mockFetchSuccess();

      const adapter = new GraphVectorizeAdapter({
        OPENAI_API_KEY: "sk-test",
        VECTORIZE_SIGNALS: signalsIndex,
      });

      await adapter.indexSignal(
        100,
        "team-1",
        "topic-5",
        "AI 규제 강화 시그널",
      );

      expect(signalsIndex.upsert).toHaveBeenCalledWith([
        expect.objectContaining({
          id: "sig:100",
          values: expect.any(Array),
          metadata: {
            teamId: "team-1",
            topicId: "topic-5",
          },
        }),
      ]);
    });

    it("topicId가 null이면 빈 문자열로 저장", async () => {
      mockFetchSuccess();

      const adapter = new GraphVectorizeAdapter({
        OPENAI_API_KEY: "sk-test",
        VECTORIZE_SIGNALS: signalsIndex,
      });

      await adapter.indexSignal(101, "team-1", null, "토픽 없는 시그널");

      expect(signalsIndex.upsert).toHaveBeenCalledWith([
        expect.objectContaining({
          metadata: expect.objectContaining({
            topicId: "",
          }),
        }),
      ]);
    });

    it("VECTORIZE_SIGNALS 없으면 skip", async () => {
      mockFetchSuccess();

      const adapter = new GraphVectorizeAdapter({
        OPENAI_API_KEY: "sk-test",
      });

      await adapter.indexSignal(1, "t1", null, "내용");
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  // ─── searchSignals ─────────────────────────────────────────────────

  describe("searchSignals", () => {
    it("Signal 시맨틱 검색 — teamId/topicId 필터", async () => {
      mockFetchSuccess();

      const matches = [
        { id: "sig:1", score: 0.88, metadata: { teamId: "t1" } },
        { id: "sig:2", score: 0.76, metadata: { teamId: "t1" } },
      ];
      vi.mocked(signalsIndex.query).mockResolvedValue({ matches });

      const adapter = new GraphVectorizeAdapter({
        OPENAI_API_KEY: "sk-test",
        VECTORIZE_SIGNALS: signalsIndex,
      });

      const results = await adapter.searchSignals("AI 규제", {
        topK: 10,
        teamId: "team-1",
        topicId: "topic-5",
      });

      expect(results).toEqual(matches);
      expect(signalsIndex.query).toHaveBeenCalledWith(expect.any(Array), {
        topK: 10,
        filter: { teamId: "team-1", topicId: "topic-5" },
        returnMetadata: true,
      });
    });

    it("VECTORIZE_SIGNALS 없으면 빈 배열 반환", async () => {
      const adapter = new GraphVectorizeAdapter({
        OPENAI_API_KEY: "sk-test",
      });

      const results = await adapter.searchSignals("검색어");
      expect(results).toEqual([]);
    });

    it("필터 없으면 filter=undefined로 호출", async () => {
      mockFetchSuccess();
      vi.mocked(signalsIndex.query).mockResolvedValue({ matches: [] });

      const adapter = new GraphVectorizeAdapter({
        OPENAI_API_KEY: "sk-test",
        VECTORIZE_SIGNALS: signalsIndex,
      });

      await adapter.searchSignals("필터 없는 검색");

      expect(signalsIndex.query).toHaveBeenCalledWith(expect.any(Array), {
        topK: 10,
        filter: undefined,
        returnMetadata: true,
      });
    });
  });
});
