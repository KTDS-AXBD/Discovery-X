import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  generateEmbedding,
  findSimilarDiscoveries,
  findDuplicateEvidence,
  type EmbeddingEnv,
} from "~/lib/embeddings/embedding-service";

// Mock fetch for OpenAI API
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function makeMockEmbedding(dim: number = 1536): number[] {
  return Array.from({ length: dim }, (_, i) => Math.sin(i * 0.01));
}

function makeMockVectorizeIndex() {
  const store = new Map<string, { values: number[]; metadata?: Record<string, string> }>();
  return {
    upsert: vi.fn(async (vectors: Array<{ id: string; values: number[]; metadata?: Record<string, string> }>) => {
      for (const v of vectors) {
        store.set(v.id, { values: v.values, metadata: v.metadata });
      }
      return { mutationId: "mock-mutation" };
    }),
    query: vi.fn(async (_vector: number[], options?: { topK?: number; returnMetadata?: boolean }) => {
      const entries = Array.from(store.entries());
      return {
        matches: entries.slice(0, options?.topK ?? 10).map(([id, data]) => ({
          id,
          score: 0.95,
          metadata: options?.returnMetadata ? data.metadata : undefined,
        })),
      };
    }),
    _store: store,
  };
}

describe("embedding-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("generateEmbedding", () => {
    it("calls OpenAI API and returns embedding", async () => {
      const mockEmb = makeMockEmbedding();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ embedding: mockEmb }] }),
      });

      const result = await generateEmbedding("test-api-key", "test text");

      expect(result).toHaveLength(1536);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.openai.com/v1/embeddings",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer test-api-key",
          }),
        })
      );
    });

    it("throws on API error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => "Rate limited",
      });

      await expect(
        generateEmbedding("test-api-key", "test text")
      ).rejects.toThrow("OpenAI embedding API error: 429");
    });

    it("truncates long text to 8000 chars", async () => {
      const longText = "a".repeat(10000);
      const mockEmb = makeMockEmbedding();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ embedding: mockEmb }] }),
      });

      await generateEmbedding("test-api-key", longText);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(callBody.input).toHaveLength(8000);
    });
  });

  describe("findSimilarDiscoveries", () => {
    it("returns empty when VECTORIZE_DISCOVERIES is not available", async () => {
      const env: EmbeddingEnv = { OPENAI_API_KEY: "test" };
      const result = await findSimilarDiscoveries(env, "test query");
      expect(result).toEqual([]);
    });

    it("excludes specified discovery ID", async () => {
      const mockIndex = makeMockVectorizeIndex();
      // Pre-populate
      mockIndex._store.set("disc-1", { values: [], metadata: { title: "Disc 1" } });
      mockIndex._store.set("disc-2", { values: [], metadata: { title: "Disc 2" } });

      const env: EmbeddingEnv = {
        OPENAI_API_KEY: "test",
        VECTORIZE_DISCOVERIES: mockIndex as unknown as EmbeddingEnv["VECTORIZE_DISCOVERIES"],
      };

      const mockEmb = makeMockEmbedding();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ embedding: mockEmb }] }),
      });

      const result = await findSimilarDiscoveries(env, "test", "disc-1");
      expect(result.every((r) => r.id !== "disc-1")).toBe(true);
    });
  });

  describe("findDuplicateEvidence", () => {
    it("returns empty when VECTORIZE_EVIDENCE is not available", async () => {
      const env: EmbeddingEnv = { OPENAI_API_KEY: "test" };
      const result = await findDuplicateEvidence(env, "ev-1", "test content");
      expect(result).toEqual([]);
    });

    it("filters by threshold", async () => {
      const mockIndex = makeMockVectorizeIndex();
      // Override query to return varied scores
      mockIndex.query.mockResolvedValueOnce({
        matches: [
          { id: "ev-2", score: 0.95, metadata: { discoveryId: "d1" } },
          { id: "ev-3", score: 0.85, metadata: { discoveryId: "d2" } },
          { id: "ev-4", score: 0.70, metadata: { discoveryId: "d3" } },
        ],
      });

      const env: EmbeddingEnv = {
        OPENAI_API_KEY: "test",
        VECTORIZE_EVIDENCE: mockIndex as unknown as EmbeddingEnv["VECTORIZE_EVIDENCE"],
      };

      const mockEmb = makeMockEmbedding();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ embedding: mockEmb }] }),
      });

      // Threshold 0.9 → only ev-2 (0.95) qualifies
      const result = await findDuplicateEvidence(env, "ev-1", "test", 0.9);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("ev-2");
      expect(result[0].score).toBe(0.95);
    });

    it("excludes self from results", async () => {
      const mockIndex = makeMockVectorizeIndex();
      mockIndex.query.mockResolvedValueOnce({
        matches: [
          { id: "ev-1", score: 1.0, metadata: {} }, // self
          { id: "ev-2", score: 0.95, metadata: { discoveryId: "d1" } },
        ],
      });

      const env: EmbeddingEnv = {
        OPENAI_API_KEY: "test",
        VECTORIZE_EVIDENCE: mockIndex as unknown as EmbeddingEnv["VECTORIZE_EVIDENCE"],
      };

      const mockEmb = makeMockEmbedding();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ embedding: mockEmb }] }),
      });

      const result = await findDuplicateEvidence(env, "ev-1", "test", 0.9);
      expect(result.every((r) => r.id !== "ev-1")).toBe(true);
    });
  });
});
