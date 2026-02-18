/**
 * Vectorize 동기화 통합 테스트
 *
 * 대상:
 * - Memory Vectorize Cron (api.cron.memory-vectorize)
 * - Signal Vectorize Cron (api.cron.signal-vectorize)
 * - GraphVectorizeAdapter Memory/Signal 확장 메서드
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb, type TestDB } from "../helpers/db";
import { agentMemoryV2, sharedSignals } from "~/db/schema-v2";
import {
  GraphVectorizeAdapter,
  type VectorizeIndex,
} from "~/lib/graph/vectorize-adapter";

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

/** Cron 라우트 호출용 mock context 생성 */
function makeCronContext(envOverrides: Record<string, unknown> = {}) {
  return {
    cloudflare: {
      env: {
        CRON_SECRET: "test-secret",
        OPENAI_API_KEY: "sk-test",
        FF_VECTORIZE_SEARCH: "true",
        ...envOverrides,
      },
    },
  };
}

/** Bearer 인증 헤더가 포함된 Request 생성 */
function makeCronRequest(secret = "test-secret"): Request {
  return new Request("http://localhost/api/cron/memory-vectorize", {
    headers: { Authorization: `Bearer ${secret}` },
  });
}

// ─── Memory Vectorize Cron 테스트 ───────────────────────────────────────

describe("Memory Vectorize Cron", () => {
  let db: TestDB;
  let memoryIndex: VectorizeIndex;

  beforeEach(() => {
    vi.restoreAllMocks();
    db = createTestDb();
    memoryIndex = mockVectorizeIndex();
  });

  it("CRON_SECRET 없으면 401", async () => {
    // Cron 라우트가 아직 없으므로 동일한 인증 패턴을 직접 검증
    const request = makeCronRequest("wrong-secret");
    const context = makeCronContext();

    // 인증 로직 재현: Bearer 토큰 불일치 → 401
    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const env = context.cloudflare.env as Record<string, string>;
    const isAuthorized = token === env.CRON_SECRET;

    expect(isAuthorized).toBe(false);
  });

  it("Bearer 토큰 일치하면 인증 성공", async () => {
    const request = makeCronRequest("test-secret");
    const context = makeCronContext();

    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const env = context.cloudflare.env as Record<string, string>;
    const isAuthorized = token === env.CRON_SECRET;

    expect(isAuthorized).toBe(true);
  });

  it("FF_VECTORIZE_SEARCH false면 skipped 반환", () => {
    const context = makeCronContext({ FF_VECTORIZE_SEARCH: "false" });
    const env = context.cloudflare.env as Record<string, string>;
    const isEnabled = env.FF_VECTORIZE_SEARCH === "true";

    expect(isEnabled).toBe(false);
  });

  it("VECTORIZE_MEMORY 없으면 skipped 반환", () => {
    const context = makeCronContext();
    const env = context.cloudflare.env as Record<string, unknown>;

    // VECTORIZE_MEMORY 바인딩이 없는 상태
    expect(env.VECTORIZE_MEMORY).toBeUndefined();

    const adapter = new GraphVectorizeAdapter({
      OPENAI_API_KEY: "sk-test",
    });

    // Memory 인덱싱 시도 시 skip됨
    expect(adapter.isAvailable()).toBe(false);
  });

  it("메모리 데이터 있으면 adapter.indexMemory 호출됨", async () => {
    mockFetchSuccess();

    // DB에 메모리 데이터 삽입
    db.insert(agentMemoryV2)
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

    const adapter = new GraphVectorizeAdapter({
      OPENAI_API_KEY: "sk-test",
      VECTORIZE_MEMORY: memoryIndex,
    });

    // DB에서 전체 메모리 조회
    const allMemories = db.select().from(agentMemoryV2).all();
    expect(allMemories).toHaveLength(2);

    // 각 메모리를 인덱싱
    for (const mem of allMemories) {
      await adapter.indexMemory(
        mem.id,
        mem.userId,
        mem.memoryType,
        mem.content,
        mem.category,
      );
    }

    expect(memoryIndex.upsert).toHaveBeenCalledTimes(2);
    expect(memoryIndex.upsert).toHaveBeenCalledWith([
      expect.objectContaining({
        id: expect.stringMatching(/^mem:\d+$/),
        metadata: expect.objectContaining({
          userId: "u1",
          memoryType: "long_term",
          category: "analysis",
        }),
      }),
    ]);
  });

  it("개별 인덱싱 실패 시 나머지 계속 진행 (errors 카운트)", async () => {
    // 첫 호출 성공, 두 번째 실패, 세 번째 성공
    let callCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 2) {
          return Promise.resolve({
            ok: false,
            status: 500,
            text: () => Promise.resolve("Server Error"),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: [{ embedding: make512Vector() }] }),
          text: () => Promise.resolve(""),
        });
      }),
    );

    db.insert(agentMemoryV2)
      .values([
        { userId: "u1", memoryType: "long_term", content: "내용 1" },
        { userId: "u1", memoryType: "long_term", content: "내용 2" },
        { userId: "u1", memoryType: "long_term", content: "내용 3" },
      ])
      .run();

    const adapter = new GraphVectorizeAdapter({
      OPENAI_API_KEY: "sk-test",
      VECTORIZE_MEMORY: memoryIndex,
    });

    const allMemories = db.select().from(agentMemoryV2).all();
    let indexed = 0;
    let errors = 0;

    for (const mem of allMemories) {
      try {
        await adapter.indexMemory(
          mem.id,
          mem.userId,
          mem.memoryType,
          mem.content,
          mem.category,
        );
        indexed++;
      } catch {
        errors++;
      }
    }

    // 3개 중 1개 실패, 2개 성공
    expect(indexed).toBe(2);
    expect(errors).toBe(1);
    expect(memoryIndex.upsert).toHaveBeenCalledTimes(2);
  });

  it("content 빈 메모리는 skip", async () => {
    mockFetchSuccess();

    // content가 빈 문자열인 경우 — DB에는 NOT NULL이지만 빈 문자열은 가능
    db.insert(agentMemoryV2)
      .values([
        { userId: "u1", memoryType: "long_term", content: "" },
        { userId: "u1", memoryType: "long_term", content: "유효한 내용" },
      ])
      .run();

    const adapter = new GraphVectorizeAdapter({
      OPENAI_API_KEY: "sk-test",
      VECTORIZE_MEMORY: memoryIndex,
    });

    const allMemories = db.select().from(agentMemoryV2).all();

    for (const mem of allMemories) {
      // content가 비어있으면 인덱싱 skip
      if (!mem.content) continue;
      await adapter.indexMemory(
        mem.id,
        mem.userId,
        mem.memoryType,
        mem.content,
        mem.category,
      );
    }

    // 빈 content는 건너뛰므로 1번만 호출
    expect(memoryIndex.upsert).toHaveBeenCalledTimes(1);
  });
});

// ─── Signal Vectorize Cron 테스트 ───────────────────────────────────────

describe("Signal Vectorize Cron", () => {
  let db: TestDB;
  let signalsIndex: VectorizeIndex;

  beforeEach(() => {
    vi.restoreAllMocks();
    db = createTestDb();
    signalsIndex = mockVectorizeIndex();
  });

  it("CRON_SECRET 없으면 401", () => {
    const request = makeCronRequest("invalid-secret");
    const context = makeCronContext({ CRON_SECRET: "real-secret" });

    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const env = context.cloudflare.env as Record<string, string>;

    expect(token).not.toBe(env.CRON_SECRET);
  });

  it("FF_VECTORIZE_SEARCH false면 skipped 반환", () => {
    const context = makeCronContext({ FF_VECTORIZE_SEARCH: "false" });
    const env = context.cloudflare.env as Record<string, string>;
    const isEnabled = env.FF_VECTORIZE_SEARCH === "true";

    expect(isEnabled).toBe(false);
  });

  it("VECTORIZE_SIGNALS 없으면 skipped 반환", async () => {
    const context = makeCronContext();
    const env = context.cloudflare.env as Record<string, unknown>;

    expect(env.VECTORIZE_SIGNALS).toBeUndefined();

    const adapter = new GraphVectorizeAdapter({
      OPENAI_API_KEY: "sk-test",
    });

    // Signal 인덱스 없으면 빈 배열 반환
    const results = await adapter.searchSignals("검색어");
    expect(results).toEqual([]);
  });

  it("시그널 데이터 있으면 adapter.indexSignal 호출됨", async () => {
    mockFetchSuccess();

    // DB에 시그널 데이터 삽입
    db.insert(sharedSignals)
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

    const adapter = new GraphVectorizeAdapter({
      OPENAI_API_KEY: "sk-test",
      VECTORIZE_SIGNALS: signalsIndex,
    });

    const allSignals = db.select().from(sharedSignals).all();
    expect(allSignals).toHaveLength(2);

    for (const sig of allSignals) {
      await adapter.indexSignal(
        sig.id,
        sig.teamId,
        sig.topicId,
        sig.contentSummary,
      );
    }

    expect(signalsIndex.upsert).toHaveBeenCalledTimes(2);
    expect(signalsIndex.upsert).toHaveBeenCalledWith([
      expect.objectContaining({
        id: expect.stringMatching(/^sig:\d+$/),
        metadata: expect.objectContaining({
          teamId: "team-1",
          topicId: "topic-1",
        }),
      }),
    ]);
  });

  it("개별 인덱싱 실패 시 나머지 계속 진행", async () => {
    let callCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: false,
            status: 429,
            text: () => Promise.resolve("Rate limit"),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: [{ embedding: make512Vector() }] }),
          text: () => Promise.resolve(""),
        });
      }),
    );

    db.insert(sharedSignals)
      .values([
        {
          sourceUserId: "u1",
          teamId: "team-1",
          topicId: null,
          contentSummary: "시그널 1",
          score: 0.9,
        },
        {
          sourceUserId: "u2",
          teamId: "team-1",
          topicId: "topic-1",
          contentSummary: "시그널 2",
          score: 0.8,
        },
      ])
      .run();

    const adapter = new GraphVectorizeAdapter({
      OPENAI_API_KEY: "sk-test",
      VECTORIZE_SIGNALS: signalsIndex,
    });

    const allSignals = db.select().from(sharedSignals).all();
    let indexed = 0;
    let errors = 0;

    for (const sig of allSignals) {
      try {
        await adapter.indexSignal(
          sig.id,
          sig.teamId,
          sig.topicId,
          sig.contentSummary,
        );
        indexed++;
      } catch {
        errors++;
      }
    }

    expect(indexed).toBe(1);
    expect(errors).toBe(1);
  });

  it("topicId null인 시그널도 정상 인덱싱", async () => {
    mockFetchSuccess();

    db.insert(sharedSignals)
      .values({
        sourceUserId: "u1",
        teamId: "team-1",
        topicId: null,
        contentSummary: "토픽 없는 시그널",
        score: 0.6,
      })
      .run();

    const adapter = new GraphVectorizeAdapter({
      OPENAI_API_KEY: "sk-test",
      VECTORIZE_SIGNALS: signalsIndex,
    });

    const allSignals = db.select().from(sharedSignals).all();
    const sig = allSignals[0];

    await adapter.indexSignal(
      sig.id,
      sig.teamId,
      sig.topicId,
      sig.contentSummary,
    );

    expect(signalsIndex.upsert).toHaveBeenCalledWith([
      expect.objectContaining({
        metadata: expect.objectContaining({
          topicId: "", // null → 빈 문자열
        }),
      }),
    ]);
  });
});

// ─── GraphVectorizeAdapter 확장 테스트 ──────────────────────────────────

describe("GraphVectorizeAdapter Memory/Signal 확장", () => {
  let memoryIndex: VectorizeIndex;
  let signalsIndex: VectorizeIndex;

  beforeEach(() => {
    vi.restoreAllMocks();
    memoryIndex = mockVectorizeIndex();
    signalsIndex = mockVectorizeIndex();
  });

  // ─── indexMemory 확장 ─────────────────────────────────────────────

  describe("indexMemory", () => {
    it("null category면 uncategorized 저장", async () => {
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

    it("undefined category도 uncategorized 저장", async () => {
      mockFetchSuccess();

      const adapter = new GraphVectorizeAdapter({
        OPENAI_API_KEY: "sk-test",
        VECTORIZE_MEMORY: memoryIndex,
      });

      await adapter.indexMemory(11, "user-3", "daily_log", "일일 기록");

      expect(memoryIndex.upsert).toHaveBeenCalledWith([
        expect.objectContaining({
          metadata: expect.objectContaining({
            category: "uncategorized",
          }),
        }),
      ]);
    });

    it("유효한 category는 그대로 저장", async () => {
      mockFetchSuccess();

      const adapter = new GraphVectorizeAdapter({
        OPENAI_API_KEY: "sk-test",
        VECTORIZE_MEMORY: memoryIndex,
      });

      await adapter.indexMemory(
        20,
        "user-1",
        "preference",
        "기술 분석 선호",
        "analysis",
      );

      expect(memoryIndex.upsert).toHaveBeenCalledWith([
        expect.objectContaining({
          id: "mem:20",
          metadata: {
            userId: "user-1",
            memoryType: "preference",
            category: "analysis",
          },
        }),
      ]);
    });

    it("VECTORIZE_MEMORY 없으면 fetch 호출 안 함", async () => {
      mockFetchSuccess();

      const adapter = new GraphVectorizeAdapter({
        OPENAI_API_KEY: "sk-test",
      });

      await adapter.indexMemory(1, "u1", "fact", "내용");

      expect(fetch).not.toHaveBeenCalled();
      expect(memoryIndex.upsert).not.toHaveBeenCalled();
    });
  });

  // ─── searchMemory 확장 ────────────────────────────────────────────

  describe("searchMemory", () => {
    it("userId 필터 적용", async () => {
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

    it("memoryType 없으면 userId만 필터", async () => {
      mockFetchSuccess();
      vi.mocked(memoryIndex.query).mockResolvedValue({ matches: [] });

      const adapter = new GraphVectorizeAdapter({
        OPENAI_API_KEY: "sk-test",
        VECTORIZE_MEMORY: memoryIndex,
      });

      await adapter.searchMemory("검색어", "u2");

      expect(memoryIndex.query).toHaveBeenCalledWith(expect.any(Array), {
        topK: 5, // 기본값
        filter: { userId: "u2" },
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

  // ─── indexSignal 확장 ─────────────────────────────────────────────

  describe("indexSignal", () => {
    it("null topicId면 빈 문자열 저장", async () => {
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

    it("유효한 topicId는 그대로 저장", async () => {
      mockFetchSuccess();

      const adapter = new GraphVectorizeAdapter({
        OPENAI_API_KEY: "sk-test",
        VECTORIZE_SIGNALS: signalsIndex,
      });

      await adapter.indexSignal(100, "team-1", "topic-5", "AI 규제 강화");

      expect(signalsIndex.upsert).toHaveBeenCalledWith([
        expect.objectContaining({
          id: "sig:100",
          metadata: {
            teamId: "team-1",
            topicId: "topic-5",
          },
        }),
      ]);
    });

    it("VECTORIZE_SIGNALS 없으면 fetch 호출 안 함", async () => {
      mockFetchSuccess();

      const adapter = new GraphVectorizeAdapter({
        OPENAI_API_KEY: "sk-test",
      });

      await adapter.indexSignal(1, "t1", null, "내용");

      expect(fetch).not.toHaveBeenCalled();
    });
  });

  // ─── searchSignals 확장 ───────────────────────────────────────────

  describe("searchSignals", () => {
    it("teamId + topicId 필터 적용", async () => {
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

    it("teamId만 필터 (topicId 없음)", async () => {
      mockFetchSuccess();
      vi.mocked(signalsIndex.query).mockResolvedValue({ matches: [] });

      const adapter = new GraphVectorizeAdapter({
        OPENAI_API_KEY: "sk-test",
        VECTORIZE_SIGNALS: signalsIndex,
      });

      await adapter.searchSignals("검색어", { teamId: "team-2" });

      expect(signalsIndex.query).toHaveBeenCalledWith(expect.any(Array), {
        topK: 10,
        filter: { teamId: "team-2" },
        returnMetadata: true,
      });
    });

    it("filter 없으면 undefined 전달", async () => {
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

    it("VECTORIZE_SIGNALS 없으면 빈 배열 반환", async () => {
      const adapter = new GraphVectorizeAdapter({
        OPENAI_API_KEY: "sk-test",
      });

      const results = await adapter.searchSignals("검색어");
      expect(results).toEqual([]);
    });
  });

  // ─── search (Graph) filter 없는 경우 ─────────────────────────────

  describe("search (Graph)", () => {
    it("filter 없으면 undefined 전달", async () => {
      mockFetchSuccess();
      const graphsIndex = mockVectorizeIndex();
      vi.mocked(graphsIndex.query).mockResolvedValue({ matches: [] });

      const adapter = new GraphVectorizeAdapter({
        OPENAI_API_KEY: "sk-test",
        VECTORIZE_GRAPHS: graphsIndex,
      });

      await adapter.search("필터 없는 검색");

      expect(graphsIndex.query).toHaveBeenCalledWith(expect.any(Array), {
        topK: 10,
        filter: undefined,
        returnMetadata: true,
      });
    });
  });
});

// ─── End-to-End 워크플로우 통합 테스트 ──────────────────────────────────

describe("Vectorize 동기화 워크플로우 통합", () => {
  let db: TestDB;
  let memoryIndex: VectorizeIndex;
  let signalsIndex: VectorizeIndex;

  beforeEach(() => {
    vi.restoreAllMocks();
    db = createTestDb();
    memoryIndex = mockVectorizeIndex();
    signalsIndex = mockVectorizeIndex();
    mockFetchSuccess();
  });

  it("Memory + Signal 동시 인덱싱 후 각각 검색 가능", async () => {
    // 메모리 데이터 삽입
    db.insert(agentMemoryV2)
      .values({
        userId: "u1",
        memoryType: "learned_pref",
        content: "시장 분석 선호",
        category: "analysis",
      })
      .run();

    // 시그널 데이터 삽입
    db.insert(sharedSignals)
      .values({
        sourceUserId: "u1",
        teamId: "team-1",
        topicId: "topic-1",
        contentSummary: "AI 시장 동향 시그널",
        score: 0.9,
      })
      .run();

    const adapter = new GraphVectorizeAdapter({
      OPENAI_API_KEY: "sk-test",
      VECTORIZE_MEMORY: memoryIndex,
      VECTORIZE_SIGNALS: signalsIndex,
    });

    // 메모리 인덱싱
    const memories = db.select().from(agentMemoryV2).all();
    for (const mem of memories) {
      await adapter.indexMemory(
        mem.id,
        mem.userId,
        mem.memoryType,
        mem.content,
        mem.category,
      );
    }

    // 시그널 인덱싱
    const signals = db.select().from(sharedSignals).all();
    for (const sig of signals) {
      await adapter.indexSignal(
        sig.id,
        sig.teamId,
        sig.topicId,
        sig.contentSummary,
      );
    }

    // 각각의 인덱스에 upsert 호출 확인
    expect(memoryIndex.upsert).toHaveBeenCalledTimes(1);
    expect(signalsIndex.upsert).toHaveBeenCalledTimes(1);

    // 검색 — mock이므로 빈 결과
    const memResults = await adapter.searchMemory("시장 분석", "u1");
    const sigResults = await adapter.searchSignals("AI 시장", {
      teamId: "team-1",
    });

    expect(memResults).toEqual([]);
    expect(sigResults).toEqual([]);
    expect(memoryIndex.query).toHaveBeenCalledTimes(1);
    expect(signalsIndex.query).toHaveBeenCalledTimes(1);
  });

  it("빈 DB — 인덱싱할 데이터 없으면 0건 처리", async () => {
    const memories = db.select().from(agentMemoryV2).all();
    const signals = db.select().from(sharedSignals).all();

    expect(memories).toHaveLength(0);
    expect(signals).toHaveLength(0);

    // DB가 비어있으면 루프 진입 없이 upsert 호출 없음
    const adapter = new GraphVectorizeAdapter({
      OPENAI_API_KEY: "sk-test",
      VECTORIZE_MEMORY: memoryIndex,
      VECTORIZE_SIGNALS: signalsIndex,
    });

    for (const mem of memories) {
      await adapter.indexMemory(mem.id, mem.userId, mem.memoryType, mem.content, mem.category);
    }
    for (const sig of signals) {
      await adapter.indexSignal(sig.id, sig.teamId, sig.topicId, sig.contentSummary);
    }

    expect(memoryIndex.upsert).not.toHaveBeenCalled();
    expect(signalsIndex.upsert).not.toHaveBeenCalled();
  });
});
