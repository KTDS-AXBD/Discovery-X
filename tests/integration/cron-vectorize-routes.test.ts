/**
 * Cron Vectorize 통합 라우트 테스트
 *
 * api.cron.vectorize?type=graph|memory|signal 통합 엔드포인트의
 * 인증, Feature Flag, 바인딩 유무, 정상 동기화를 검증한다.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb, type TestDB } from "../helpers/db";
import { agentMemoryV2, graphs } from "~/db/schema-v2";
import { sharedSignals } from "~/db";
import type { VectorizeIndex } from "~/lib/graph/vectorize-adapter";

// getDb를 모킹 — 라우트에서 getDb(env.DB) 호출 시 TestDB를 반환
let testDb: TestDB;
vi.mock("~/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/db")>();
  return {
    ...actual,
    getDb: () => testDb,
  };
});

import { loader } from "~/routes/api.cron.vectorize";

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

/** Cron 라우트 호출용 mock context (LoaderFunctionArgs 호환) */
function makeCronContext(envOverrides: Record<string, unknown> = {}) {
  return {
    cloudflare: {
      env: {
        CRON_SECRET: "test-secret",
        OPENAI_API_KEY: "sk-test",
        FF_VECTORIZE_SEARCH: "true",
        DB: {}, // getDb가 모킹되므로 실제 값 불필요
        ...envOverrides,
      },
    },
  };
}

/** Bearer 인증 헤더가 포함된 Request 생성 */
function makeCronRequest(path: string, secret = "test-secret"): Request {
  return new Request(`http://localhost/api/cron/${path}`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
}

// ─── Memory Vectorize 라우트 테스트 ──────────────────────────────────────

describe("api.cron.vectorize?type=memory", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    testDb = createTestDb();
  });

  it("인증 실패 → 401", async () => {
    const request = makeCronRequest("vectorize?type=memory", "wrong-secret");
    const context = makeCronContext();

    const response = await loader({
      request,
      context: context as never,
      params: {},
    });

    expect(response.status).toBe(401);
  });

  it("FF_VECTORIZE_SEARCH 비활성 → skipped: true", async () => {
    const request = makeCronRequest("vectorize?type=memory");
    const context = makeCronContext({ FF_VECTORIZE_SEARCH: "false" });

    const response = await loader({
      request,
      context: context as never,
      params: {},
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ skipped: true });
  });

  it("VECTORIZE_MEMORY 없음 → skipped: true", async () => {
    const request = makeCronRequest("vectorize?type=memory");
    // VECTORIZE_MEMORY 바인딩을 제공하지 않음
    const context = makeCronContext();

    const response = await loader({
      request,
      context: context as never,
      params: {},
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ skipped: true });
  });

  it("정상 — mock DB 데이터 + mock Vectorize", async () => {
    mockFetchSuccess();

    const memoryIndex = mockVectorizeIndex();

    // DB에 메모리 데이터 삽입
    testDb
      .insert(agentMemoryV2)
      .values([
        {
          userId: "u1",
          memoryType: "long_term",
          content: "사용자는 기술 분석을 선호한다",
          category: "analysis",
        },
        {
          userId: "u1",
          memoryType: "learned_pref",
          content: "마케팅 관련 주제에 관심이 높다",
          category: "interest",
        },
      ])
      .run();

    const request = makeCronRequest("vectorize?type=memory");
    const context = makeCronContext({ VECTORIZE_MEMORY: memoryIndex });

    const response = await loader({
      request,
      context: context as never,
      params: {},
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      indexed: 2,
      errors: 0,
      total: 2,
    });
    expect(memoryIndex.upsert).toHaveBeenCalledTimes(2);
  });

  it("빈 content 메모리는 skipped로 카운트", async () => {
    mockFetchSuccess();

    const memoryIndex = mockVectorizeIndex();

    testDb
      .insert(agentMemoryV2)
      .values([
        {
          userId: "u1",
          memoryType: "long_term",
          content: "",
          category: "empty",
        },
        {
          userId: "u1",
          memoryType: "long_term",
          content: "유효한 내용",
          category: "valid",
        },
      ])
      .run();

    const request = makeCronRequest("vectorize?type=memory");
    const context = makeCronContext({ VECTORIZE_MEMORY: memoryIndex });

    const response = await loader({
      request,
      context: context as never,
      params: {},
    });

    const body = await response.json();
    expect(body).toMatchObject({
      indexed: 1,
      skipped: 1,
      errors: 0,
      total: 2,
    });
  });
});

// ─── Signal Vectorize 라우트 테스트 ──────────────────────────────────────

describe("api.cron.vectorize?type=signal", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    testDb = createTestDb();
  });

  it("인증 실패 → 401", async () => {
    const request = makeCronRequest("vectorize?type=signal", "bad-token");
    const context = makeCronContext();

    const response = await loader({
      request,
      context: context as never,
      params: {},
    });

    expect(response.status).toBe(401);
  });

  it("FF 비활성 → skipped: true", async () => {
    const request = makeCronRequest("vectorize?type=signal");
    const context = makeCronContext({ FF_VECTORIZE_SEARCH: "false" });

    const response = await loader({
      request,
      context: context as never,
      params: {},
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ skipped: true });
  });

  it("정상 — mock 데이터 → indexed: N", async () => {
    mockFetchSuccess();

    const signalsIndex = mockVectorizeIndex();

    testDb
      .insert(sharedSignals)
      .values([
        {
          sourceUserId: "u1",
          teamId: "team-1",
          topicId: "topic-1",
          contentSummary: "AI 규제 강화 시그널",
          score: 0.85,
        },
        {
          sourceUserId: "u2",
          teamId: "team-1",
          topicId: "topic-2",
          contentSummary: "SaaS 시장 침체 시그널",
          score: 0.72,
        },
      ])
      .run();

    const request = makeCronRequest("vectorize?type=signal");
    const context = makeCronContext({ VECTORIZE_SIGNALS: signalsIndex });

    const response = await loader({
      request,
      context: context as never,
      params: {},
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      indexed: 2,
      errors: 0,
      total: 2,
    });
    expect(signalsIndex.upsert).toHaveBeenCalledTimes(2);
  });

  it("VECTORIZE_SIGNALS 없으면 skipped", async () => {
    const request = makeCronRequest("vectorize?type=signal");
    const context = makeCronContext();

    const response = await loader({
      request,
      context: context as never,
      params: {},
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ skipped: true });
  });
});

// ─── Graph Vectorize 라우트 테스트 ───────────────────────────────────────

describe("api.cron.vectorize?type=graph", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    testDb = createTestDb();
  });

  it("인증 실패 → 401", async () => {
    const request = makeCronRequest("vectorize?type=graph", "invalid");
    const context = makeCronContext();

    const response = await loader({
      request,
      context: context as never,
      params: {},
    });

    expect(response.status).toBe(401);
  });

  it("정상 — mock 데이터 → indexed: N", async () => {
    mockFetchSuccess();

    const graphsIndex = mockVectorizeIndex();

    const jsonld = JSON.stringify({
      "@context": { "@vocab": "https://schema.org/" },
      "@graph": [
        { "@id": "node-1", "@type": "Thing", name: "AI 규제" },
        { "@id": "node-2", "@type": "Thing", name: "시장 분석" },
      ],
    });

    testDb
      .insert(graphs)
      .values({
        id: "graph-1",
        scopeType: "user",
        scopeId: "user-1",
        jsonld,
        version: 1,
        contentHash: "hash-1",
      })
      .run();

    const request = makeCronRequest("vectorize?type=graph");
    const context = makeCronContext({ VECTORIZE_GRAPHS: graphsIndex });

    const response = await loader({
      request,
      context: context as never,
      params: {},
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, number>;
    expect(body.indexed).toBe(2); // 2개 노드
    expect(body.errors).toBe(0);
    expect(graphsIndex.upsert).toHaveBeenCalledTimes(2);
  });

  it("JSON 파싱 실패 시 에러 카운트", async () => {
    mockFetchSuccess();

    const graphsIndex = mockVectorizeIndex();

    // 잘못된 JSON을 삽입
    testDb
      .insert(graphs)
      .values({
        id: "graph-bad",
        scopeType: "user",
        scopeId: "user-2",
        jsonld: "{ invalid json !!!",
        version: 1,
        contentHash: "hash-bad",
      })
      .run();

    const request = makeCronRequest("vectorize?type=graph");
    const context = makeCronContext({ VECTORIZE_GRAPHS: graphsIndex });

    const response = await loader({
      request,
      context: context as never,
      params: {},
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, number>;
    expect(body.errors).toBe(1);
    expect(body.indexed).toBe(0);
  });

  it("VECTORIZE_GRAPHS 없으면 skipped", async () => {
    const request = makeCronRequest("vectorize?type=graph");
    const context = makeCronContext();

    const response = await loader({
      request,
      context: context as never,
      params: {},
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ skipped: true });
  });
});

// ─── type 파라미터 검증 테스트 ───────────────────────────────────────────

describe("api.cron.vectorize — type 파라미터 검증", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    testDb = createTestDb();
  });

  it("type 없음 → 400", async () => {
    const request = makeCronRequest("vectorize");
    const context = makeCronContext();

    const response = await loader({
      request,
      context: context as never,
      params: {},
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toMatchObject({ error: expect.stringContaining("Invalid type") });
  });

  it("잘못된 type → 400", async () => {
    const request = makeCronRequest("vectorize?type=invalid");
    const context = makeCronContext();

    const response = await loader({
      request,
      context: context as never,
      params: {},
    });

    expect(response.status).toBe(400);
  });
});

// ─── Health 엔드포인트 테스트 ────────────────────────────────────────────

describe("api.health 라우트", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    testDb = createTestDb();
  });

  it("인증 없이 정상 응답", async () => {
    const { loader: healthLoader } = await import("~/routes/api.health");

    const request = new Request("http://localhost/api/health");
    const context = {
      cloudflare: {
        env: {
          DB: {}, // getDb가 모킹되므로 실제 값 불필요
          FF_VECTORIZE_SEARCH: "true",
        },
      },
    };

    const response = await healthLoader({
      request,
      context: context as never,
      params: {},
    });

    // getDb 모킹으로 TestDB 반환 → SELECT 1 성공 → healthy
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("healthy");
    expect(body).toHaveProperty("timestamp");
    expect(body).toHaveProperty("version");
    expect(body.checks).toHaveProperty("database");
    expect(body.checks.database.status).toBe("ok");
  });
});
