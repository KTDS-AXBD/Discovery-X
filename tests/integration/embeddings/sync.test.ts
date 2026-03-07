import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, type TestDB } from "../../helpers/db";
import { makeUser, makeDiscovery, makeEvidence, resetFixtureCounter } from "../../helpers/fixtures";
import {
  users,
  discoveries,
  evidence,
  evidenceDuplicateCandidates,
  radarSources,
  radarItems,
} from "~/db";
import { eq } from "drizzle-orm";
import { syncEmbeddings } from "~/lib/embeddings/sync";
import type { EmbeddingEnv } from "~/lib/embeddings/embedding-service";

function asDB(db: TestDB) {
  return db as unknown as Parameters<typeof syncEmbeddings>[0];
}

// Mock OpenAI fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function makeMockEmbedding(): number[] {
  return Array.from({ length: 1536 }, (_, i) => Math.sin(i * 0.01));
}

function setupOpenAIMock() {
  mockFetch.mockImplementation(async () => ({
    ok: true,
    json: async () => ({ data: [{ embedding: makeMockEmbedding() }] }),
  }));
}

function makeMockVectorizeIndex() {
  const store = new Map<string, { values: number[]; metadata?: Record<string, string> }>();
  return {
    upsert: vi.fn(async (vectors: Array<{ id: string; values: number[]; metadata?: Record<string, string> }>) => {
      for (const v of vectors) {
        store.set(v.id, { values: v.values, metadata: v.metadata });
      }
      return { mutationId: "mock" };
    }),
    query: vi.fn(async () => ({
      matches: [] as Array<{ id: string; score: number; metadata?: Record<string, string> }>,
    })),
    _store: store,
  };
}

describe("syncEmbeddings", () => {
  let db: TestDB;

  beforeEach(() => {
    resetFixtureCounter();
    db = createTestDb();
    vi.clearAllMocks();
    setupOpenAIMock();
  });

  it("syncs discoveries with null embeddingUpdatedAt", async () => {
    const owner = makeUser({ id: "owner-1" });
    db.insert(users).values(owner).run();

    db.insert(discoveries)
      .values([
        makeDiscovery({
          id: "disc-1",
          ownerId: owner.id,
          embeddingUpdatedAt: undefined, // null → needs sync
        }),
        makeDiscovery({
          id: "disc-2",
          ownerId: owner.id,
          embeddingUpdatedAt: new Date(), // already synced
          updatedAt: new Date(Date.now() - 1000), // updatedAt < embeddingUpdatedAt
        }),
      ])
      .run();

    const mockDiscIndex = makeMockVectorizeIndex();
    const mockEvIndex = makeMockVectorizeIndex();

    const env: EmbeddingEnv = {
      OPENAI_API_KEY: "test-key",
      VECTORIZE_DISCOVERIES: mockDiscIndex as unknown as EmbeddingEnv["VECTORIZE_DISCOVERIES"],
      VECTORIZE_EVIDENCE: mockEvIndex as unknown as EmbeddingEnv["VECTORIZE_EVIDENCE"],
    };

    const result = await syncEmbeddings(asDB(db), env);

    expect(result.discoveriesSynced).toBe(1); // only disc-1
    expect(mockDiscIndex.upsert).toHaveBeenCalledTimes(1);
  });

  it("updates embeddingUpdatedAt after sync", async () => {
    const owner = makeUser({ id: "owner-1" });
    db.insert(users).values(owner).run();

    db.insert(discoveries)
      .values(makeDiscovery({ id: "disc-1", ownerId: owner.id }))
      .run();

    const mockDiscIndex = makeMockVectorizeIndex();
    const env: EmbeddingEnv = {
      OPENAI_API_KEY: "test-key",
      VECTORIZE_DISCOVERIES: mockDiscIndex as unknown as EmbeddingEnv["VECTORIZE_DISCOVERIES"],
    };

    await syncEmbeddings(asDB(db), env);

    const disc = db.select().from(discoveries).where(eq(discoveries.id, "disc-1")).all();
    expect(disc[0].embeddingUpdatedAt).toBeTruthy();
  });

  it("syncs evidence and detects duplicates", async () => {
    const owner = makeUser({ id: "owner-1" });
    db.insert(users).values(owner).run();

    db.insert(discoveries)
      .values(makeDiscovery({ id: "disc-1", ownerId: owner.id }))
      .run();

    db.insert(evidence)
      .values([
        makeEvidence({ id: "ev-1", discoveryId: "disc-1", createdById: owner.id, content: "Test evidence 1" }),
        makeEvidence({ id: "ev-2", discoveryId: "disc-1", createdById: owner.id, content: "Test evidence 2" }),
      ])
      .run();

    const mockDiscIndex = makeMockVectorizeIndex();
    const mockEvIndex = makeMockVectorizeIndex();

    // Return a duplicate candidate when ev-1 is queried
    let callCount = 0;
    mockEvIndex.query.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        // First evidence finds a duplicate
        return { matches: [{ id: "ev-2", score: 0.95, metadata: { discoveryId: "disc-1" } }] };
      }
      return { matches: [] };
    });

    const env: EmbeddingEnv = {
      OPENAI_API_KEY: "test-key",
      VECTORIZE_DISCOVERIES: mockDiscIndex as unknown as EmbeddingEnv["VECTORIZE_DISCOVERIES"],
      VECTORIZE_EVIDENCE: mockEvIndex as unknown as EmbeddingEnv["VECTORIZE_EVIDENCE"],
    };

    const result = await syncEmbeddings(asDB(db), env);

    expect(result.evidenceSynced).toBe(2);
    expect(result.duplicatesFound).toBe(1);

    // Check duplicate candidate was created
    const candidates = db.select().from(evidenceDuplicateCandidates).all();
    expect(candidates).toHaveLength(1);
    expect(candidates[0].evidenceId1).toBe("ev-1");
    expect(candidates[0].evidenceId2).toBe("ev-2");
    expect(candidates[0].similarityScore).toBe(95);
  });

  it("respects batch size limit", async () => {
    const owner = makeUser({ id: "owner-1" });
    db.insert(users).values(owner).run();

    // Create 5 discoveries
    for (let i = 0; i < 5; i++) {
      db.insert(discoveries)
        .values(makeDiscovery({ ownerId: owner.id }))
        .run();
    }

    const mockDiscIndex = makeMockVectorizeIndex();
    const env: EmbeddingEnv = {
      OPENAI_API_KEY: "test-key",
      VECTORIZE_DISCOVERIES: mockDiscIndex as unknown as EmbeddingEnv["VECTORIZE_DISCOVERIES"],
    };

    // Batch size 2 → only 2 synced
    const result = await syncEmbeddings(asDB(db), env, 2);

    expect(result.discoveriesSynced).toBe(2);
  });

  it("reports errors without failing entire batch", async () => {
    const owner = makeUser({ id: "owner-1" });
    db.insert(users).values(owner).run();

    db.insert(discoveries)
      .values([
        makeDiscovery({ id: "disc-1", ownerId: owner.id }),
        makeDiscovery({ id: "disc-2", ownerId: owner.id }),
      ])
      .run();

    // First call fails, second succeeds
    let callCount = 0;
    mockFetch.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return { ok: false, status: 500, text: async () => "Server Error" };
      }
      return {
        ok: true,
        json: async () => ({ data: [{ embedding: makeMockEmbedding() }] }),
      };
    });

    const mockDiscIndex = makeMockVectorizeIndex();
    const env: EmbeddingEnv = {
      OPENAI_API_KEY: "test-key",
      VECTORIZE_DISCOVERIES: mockDiscIndex as unknown as EmbeddingEnv["VECTORIZE_DISCOVERIES"],
    };

    const result = await syncEmbeddings(asDB(db), env);

    expect(result.discoveriesSynced).toBe(1); // One succeeded
    expect(result.errors).toHaveLength(1); // One failed
    expect(result.errors[0]).toContain("disc-1");
  });

  // I-28: BD PoC — Radar 아이템 Embedding 동기화
  it("syncs radar items with null embeddingUpdatedAt when VECTORIZE_RADAR is set", async () => {
    // Radar 소스 + 아이템 셋업
    db.insert(radarSources).values({
      id: "src-radar",
      name: "TechCrunch",
      sourceType: "rss",
      url: "https://techcrunch.com/feed",
    }).run();

    db.insert(radarItems).values([
      {
        id: "radar-1",
        sourceId: "src-radar",
        urlHash: "hash-r1",
        url: "https://techcrunch.com/ai-1",
        title: "AI Article 1",
        titleKo: "AI 제조업 품질 검사 기술의 발전",
        summaryKo: "비전 AI 기반 품질 검사가 급성장 중",
        embeddingUpdatedAt: undefined, // needs sync
      },
      {
        id: "radar-2",
        sourceId: "src-radar",
        urlHash: "hash-r2",
        url: "https://techcrunch.com/ai-2",
        title: "AI Article 2",
        titleKo: "AI 물류 혁신 사례",
        summaryKo: "자율 물류 시스템 도입 사례",
        embeddingUpdatedAt: new Date(), // already synced
      },
    ]).run();

    const mockDiscIndex = makeMockVectorizeIndex();
    const mockEvIndex = makeMockVectorizeIndex();
    const mockRadarIndex = makeMockVectorizeIndex();

    const env = {
      OPENAI_API_KEY: "test-key",
      VECTORIZE_DISCOVERIES: mockDiscIndex as unknown as EmbeddingEnv["VECTORIZE_DISCOVERIES"],
      VECTORIZE_EVIDENCE: mockEvIndex as unknown as EmbeddingEnv["VECTORIZE_EVIDENCE"],
      VECTORIZE_RADAR: mockRadarIndex as unknown as EmbeddingEnv["VECTORIZE_DISCOVERIES"],
    };

    const result = await syncEmbeddings(asDB(db), env as unknown as EmbeddingEnv);

    // radar-1만 동기화 (radar-2는 이미 embeddingUpdatedAt 설정됨)
    expect(result.radarItemsSynced).toBe(1);
    expect(mockRadarIndex.upsert).toHaveBeenCalledTimes(1);

    // embeddingUpdatedAt 갱신 확인
    const updated = db.select().from(radarItems)
      .where(eq(radarItems.id, "radar-1")).get();
    expect(updated!.embeddingUpdatedAt).toBeTruthy();

    // radar-2는 변경되지 않음
    const unchanged = db.select().from(radarItems)
      .where(eq(radarItems.id, "radar-2")).get();
    expect(unchanged!.embeddingUpdatedAt).toBeTruthy();
  });
});
