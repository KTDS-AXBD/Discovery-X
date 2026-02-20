/**
 * collab-worker Cron 핸들러 테스트
 *
 * 대상: collab-worker/src/cron-handler.ts
 * - handleCron — 일간/주간/unknown 스케줄 분기
 * - runBriefing, runMemoryCompact, runProjectionSync
 * - runSignalRoute, runWeeklySummary
 * - 에러 핸들링 (개별 작업 실패 격리)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Env } from "collab-worker/src/types";
import { handleCron } from "collab-worker/src/cron-handler";

// ─── D1 Mock ─────────────────────────────────────────────────────

function createMockDb() {
  const mockRun = vi.fn().mockResolvedValue({ meta: { changes: 0 } });
  const mockAll = vi.fn().mockResolvedValue({ results: [] });
  const mockFirst = vi.fn().mockResolvedValue(null);
  const mockBind = vi.fn().mockReturnValue({
    first: mockFirst,
    all: mockAll,
    run: mockRun,
  });
  const mockPrepare = vi.fn().mockReturnValue({
    bind: mockBind,
    first: mockFirst,
    all: mockAll,
    run: mockRun,
  });
  return {
    prepare: mockPrepare,
    _bind: mockBind,
    _all: mockAll,
    _first: mockFirst,
    _run: mockRun,
  };
}

function createMockEnv(overrides?: Partial<Env>): Env {
  return {
    DB: createMockDb() as unknown as D1Database,
    ANTHROPIC_API_KEY: "test-key",
    OPENAI_API_KEY: "test-key",
    CRON_SECRET: "test-cron-secret",
    FF_PIPELINE_BRIDGE: "true",
    FF_MEMORY_LIFECYCLE: "true",
    ...overrides,
  };
}

// ─── 헬퍼: DB를 Env에서 추출 ─────────────────────────────────────

function getDb(env: Env) {
  return env.DB as unknown as ReturnType<typeof createMockDb>;
}

// ─── handleCron 분기 테스트 ─────────────────────────────────────

describe("handleCron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("일간 스케줄 (0 0 * * *) → 3작업 실행 (briefing, memory-compact, projection-sync)", async () => {
    const env = createMockEnv();
    const results = await handleCron("0 0 * * *", env);

    expect(results).toHaveLength(3);
    expect(results.map((r) => r.job)).toEqual([
      "briefing",
      "memory-compact",
      "projection-sync",
    ]);
    results.forEach((r) => {
      expect(r.success).toBe(true);
      expect(r.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  it("주간 스케줄 (0 1 * * 1) → 2작업 실행 (signal-route, weekly-summary)", async () => {
    const env = createMockEnv();
    const results = await handleCron("0 1 * * 1", env);

    expect(results).toHaveLength(2);
    expect(results.map((r) => r.job)).toEqual([
      "signal-route",
      "weekly-summary",
    ]);
    results.forEach((r) => {
      expect(r.success).toBe(true);
    });
  });

  it("알 수 없는 cron → 빈 배열 반환", async () => {
    const env = createMockEnv();
    const results = await handleCron("unknown", env);

    expect(results).toEqual([]);
  });
});

// ─── runBriefing 테스트 ─────────────────────────────────────────

describe("runBriefing", () => {
  it("pending 시그널이 있는 Topic 0건 → topicsProcessed: 0", async () => {
    const env = createMockEnv();
    // 기본 mock: all()이 { results: [] } 반환
    const results = await handleCron("0 0 * * *", env);
    const briefing = results.find((r) => r.job === "briefing")!;

    expect(briefing.success).toBe(true);
    expect(briefing.details).toMatchObject({ topicsProcessed: 0 });
  });

  it("pending 시그널이 있는 Topic 2건 → topicsProcessed: 2", async () => {
    const db = createMockDb();
    // briefing은 첫 번째 prepare().all() 호출
    db._all.mockResolvedValueOnce({
      results: [
        { id: "t1", name: "Topic1", signal_count: 3 },
        { id: "t2", name: "Topic2", signal_count: 1 },
      ],
    });

    const env = createMockEnv({ DB: db as unknown as D1Database });
    const results = await handleCron("0 0 * * *", env);
    const briefing = results.find((r) => r.job === "briefing")!;

    expect(briefing.success).toBe(true);
    expect(briefing.details).toMatchObject({ topicsProcessed: 2 });
  });
});

// ─── runMemoryCompact 테스트 ─────────────────────────────────────

describe("runMemoryCompact", () => {
  it("FF_MEMORY_LIFECYCLE 'false' → skipped: true", async () => {
    const env = createMockEnv({ FF_MEMORY_LIFECYCLE: "false" });
    const results = await handleCron("0 0 * * *", env);
    const compact = results.find((r) => r.job === "memory-compact")!;

    expect(compact.success).toBe(true);
    expect(compact.details).toMatchObject({ skipped: true });
  });

  it("FF_MEMORY_LIFECYCLE 'true' + daily_log 3건 → promoted: 3", async () => {
    const db = createMockDb();
    // briefing → all() (첫 호출, 기본 빈 배열)
    // memory-compact → run() (두 번째 prepare)
    // run()에서 meta.changes를 3으로 설정
    db._run.mockResolvedValue({ meta: { changes: 3 } });

    const env = createMockEnv({
      DB: db as unknown as D1Database,
      FF_MEMORY_LIFECYCLE: "true",
    });
    const results = await handleCron("0 0 * * *", env);
    const compact = results.find((r) => r.job === "memory-compact")!;

    expect(compact.success).toBe(true);
    expect(compact.details).toMatchObject({ promoted: 3 });
  });

  it("해당 없는 경우 (7일 미만/importance < 0.5) → promoted: 0", async () => {
    const db = createMockDb();
    db._run.mockResolvedValue({ meta: { changes: 0 } });

    const env = createMockEnv({
      DB: db as unknown as D1Database,
      FF_MEMORY_LIFECYCLE: "true",
    });
    const results = await handleCron("0 0 * * *", env);
    const compact = results.find((r) => r.job === "memory-compact")!;

    expect(compact.success).toBe(true);
    expect(compact.details).toMatchObject({ promoted: 0 });
  });
});

// ─── runProjectionSync 테스트 ─────────────────────────────────────

describe("runProjectionSync", () => {
  it("stale projection 0건 → staleProjections: 0", async () => {
    const env = createMockEnv();
    const results = await handleCron("0 0 * * *", env);
    const sync = results.find((r) => r.job === "projection-sync")!;

    expect(sync.success).toBe(true);
    expect(sync.details).toMatchObject({ staleProjections: 0 });
  });

  it("stale projection 5건 → staleProjections: 5", async () => {
    const db = createMockDb();
    // projection-sync는 3번째 prepare().all() 호출
    // briefing(all 1) → memory-compact(run) → projection-sync(all 2)
    // all()의 두 번째 호출에서 5건 반환
    db._all
      .mockResolvedValueOnce({ results: [] }) // briefing
      .mockResolvedValueOnce({
        results: [
          { id: 1, scope_type: "topic", scope_id: "t1", graph_version: 2, proj_version: 1 },
          { id: 2, scope_type: "topic", scope_id: "t2", graph_version: 3, proj_version: 1 },
          { id: 3, scope_type: "user", scope_id: "u1", graph_version: 2, proj_version: null },
          { id: 4, scope_type: "topic", scope_id: "t3", graph_version: 5, proj_version: 3 },
          { id: 5, scope_type: "team", scope_id: "tm1", graph_version: 1, proj_version: null },
        ],
      }); // projection-sync

    const env = createMockEnv({ DB: db as unknown as D1Database });
    const results = await handleCron("0 0 * * *", env);
    const sync = results.find((r) => r.job === "projection-sync")!;

    expect(sync.success).toBe(true);
    expect(sync.details).toMatchObject({ staleProjections: 5 });
  });
});

// ─── runSignalRoute 테스트 ─────────────────────────────────────

describe("runSignalRoute", () => {
  it("FF_PIPELINE_BRIDGE 'false' → skipped: true", async () => {
    const env = createMockEnv({ FF_PIPELINE_BRIDGE: "false" });
    const results = await handleCron("0 1 * * 1", env);
    const route = results.find((r) => r.job === "signal-route")!;

    expect(route.success).toBe(true);
    expect(route.details).toMatchObject({ skipped: true });
  });

  it("pending 시그널 0건 → pending: 0, routed: 0", async () => {
    const env = createMockEnv({ FF_PIPELINE_BRIDGE: "true" });
    // all()이 빈 results 반환 (기본)
    const results = await handleCron("0 1 * * 1", env);
    const route = results.find((r) => r.job === "signal-route")!;

    expect(route.success).toBe(true);
    expect(route.details).toMatchObject({ pending: 0, routed: 0 });
  });

  it("pending 시그널 3건 → pending: 3, routed: 3 + UPDATE 호출", async () => {
    const db = createMockDb();
    // signal-route: 첫 번째 all()에서 pending 시그널 3건
    db._all.mockResolvedValueOnce({
      results: [
        { id: 1, topic_id: "t1", content: "sig1", created_at: 1000 },
        { id: 2, topic_id: "t1", content: "sig2", created_at: 1001 },
        { id: 3, topic_id: "t2", content: "sig3", created_at: 1002 },
      ],
    });

    const env = createMockEnv({
      DB: db as unknown as D1Database,
      FF_PIPELINE_BRIDGE: "true",
    });
    const results = await handleCron("0 1 * * 1", env);
    const route = results.find((r) => r.job === "signal-route")!;

    expect(route.success).toBe(true);
    expect(route.details).toMatchObject({ pending: 3, routed: 3 });

    // UPDATE 쿼리 확인 (signal-route SELECT + UPDATE + weekly-summary SELECT = 3)
    expect(db.prepare).toHaveBeenCalledTimes(3);
    const updateSql = db.prepare.mock.calls[1][0] as string;
    expect(updateSql).toContain("UPDATE shared_signals");
    expect(updateSql).toContain("status = 'reviewed'");

    // bind에 3개 ID 전달 확인 (SELECT는 bind 안 씀, UPDATE만 bind 호출)
    expect(db._bind.mock.calls[0]).toEqual([1, 2, 3]);
  });
});

// ─── runWeeklySummary 테스트 ─────────────────────────────────────

describe("runWeeklySummary", () => {
  it("활성 Topic 0건 → activeTopics: 0, summariesCreated: 0", async () => {
    const db = createMockDb();
    // signal-route의 all() 호출 + weekly-summary의 all() 호출
    db._all
      .mockResolvedValueOnce({ results: [] }) // signal-route
      .mockResolvedValueOnce({ results: [] }); // weekly-summary

    const env = createMockEnv({ DB: db as unknown as D1Database });
    const results = await handleCron("0 1 * * 1", env);
    const summary = results.find((r) => r.job === "weekly-summary")!;

    expect(summary.success).toBe(true);
    expect(summary.details).toMatchObject({
      activeTopics: 0,
      summariesCreated: 0,
    });
  });

  it("활성 Topic 2건 → activeTopics: 2, summariesCreated: 2 + INSERT 호출", async () => {
    const db = createMockDb();
    // signal-route: all() → 빈 배열
    db._all
      .mockResolvedValueOnce({ results: [] }) // signal-route
      .mockResolvedValueOnce({
        results: [
          { id: "t1", name: "TopicA", graph_events: 5, new_signals: 3, active_members: 2 },
          { id: "t2", name: "TopicB", graph_events: 2, new_signals: 1, active_members: 1 },
        ],
      }); // weekly-summary

    const env = createMockEnv({ DB: db as unknown as D1Database });
    const results = await handleCron("0 1 * * 1", env);
    const summary = results.find((r) => r.job === "weekly-summary")!;

    expect(summary.success).toBe(true);
    expect(summary.details).toMatchObject({
      activeTopics: 2,
      summariesCreated: 2,
    });

    // INSERT 쿼리 호출 확인 (SELECT 1 + INSERT 2)
    const prepareCalls = db.prepare.mock.calls;
    const insertCalls = prepareCalls.filter((call) =>
      (call[0] as string).includes("INSERT INTO shared_signals"),
    );
    expect(insertCalls.length).toBe(2);
  });

  it("INSERT 실패 시 → summariesCreated가 성공한 것만 카운트", async () => {
    const db = createMockDb();
    db._all
      .mockResolvedValueOnce({ results: [] }) // signal-route
      .mockResolvedValueOnce({
        results: [
          { id: "t1", name: "TopicA", graph_events: 5, new_signals: 3, active_members: 2 },
          { id: "t2", name: "TopicB", graph_events: 2, new_signals: 1, active_members: 1 },
        ],
      }); // weekly-summary

    // 첫 INSERT 성공, 두 번째 INSERT 실패
    // signal-route는 all() 빈 결과 → run() 미호출, weekly-summary의 INSERT만 소비
    db._run
      .mockResolvedValueOnce({ meta: { changes: 1 } }) // 첫 번째 topic INSERT 성공
      .mockRejectedValueOnce(new Error("INSERT 실패")); // 두 번째 topic INSERT 실패

    const env = createMockEnv({ DB: db as unknown as D1Database });
    const results = await handleCron("0 1 * * 1", env);
    const summary = results.find((r) => r.job === "weekly-summary")!;

    expect(summary.success).toBe(true);
    expect(summary.details).toMatchObject({
      activeTopics: 2,
      summariesCreated: 1, // 하나만 성공
    });
  });
});

// ─── 에러 핸들링 ─────────────────────────────────────────────────

describe("에러 핸들링", () => {
  it("개별 작업 실패 시 success: false + error 메시지 반환", async () => {
    const db = createMockDb();
    // briefing에서 DB 에러 발생
    db._all.mockRejectedValueOnce(new Error("DB 연결 실패"));

    const env = createMockEnv({ DB: db as unknown as D1Database });
    const results = await handleCron("0 0 * * *", env);
    const briefing = results.find((r) => r.job === "briefing")!;

    expect(briefing.success).toBe(false);
    expect(briefing.error).toBe("DB 연결 실패");
    expect(briefing.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("하나가 실패해도 나머지 작업은 계속 실행", async () => {
    const db = createMockDb();
    // briefing에서 DB 에러 → 나머지는 정상
    db._all.mockRejectedValueOnce(new Error("briefing 실패"));

    const env = createMockEnv({ DB: db as unknown as D1Database });
    const results = await handleCron("0 0 * * *", env);

    expect(results).toHaveLength(3);
    expect(results[0].job).toBe("briefing");
    expect(results[0].success).toBe(false);

    // memory-compact, projection-sync는 계속 실행
    expect(results[1].job).toBe("memory-compact");
    expect(results[1].success).toBe(true);

    expect(results[2].job).toBe("projection-sync");
    expect(results[2].success).toBe(true);
  });
});
