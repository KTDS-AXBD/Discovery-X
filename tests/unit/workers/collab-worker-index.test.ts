/**
 * collab-worker 엔트리포인트 테스트
 *
 * 대상: collab-worker/src/index.ts
 * - GET /health → 200 + JSON
 * - POST /trigger → CRON_SECRET 인증 + handleCron 호출
 * - logCronResults → D1 INSERT
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Env } from "collab-worker/src/types";

// handleCron을 mock하여 Worker 엔트리 로직만 격리 테스트
vi.mock("collab-worker/src/cron-handler", () => ({
  handleCron: vi.fn(),
}));

import { handleCron } from "collab-worker/src/cron-handler";
import worker from "collab-worker/src/index";

const mockHandleCron = vi.mocked(handleCron);

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

// ─── 테스트 ─────────────────────────────────────────────────────

describe("collab-worker fetch()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── GET /health ──

  describe("GET /health", () => {
    it("200 + JSON (status: ok, worker: collab-worker)", async () => {
      const env = createMockEnv();
      const req = new Request("http://localhost/health");

      const res = await worker.fetch(req, env);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toMatchObject({
        status: "ok",
        worker: "collab-worker",
      });
      expect((body as Record<string, unknown>).timestamp).toBeDefined();
    });
  });

  // ── POST /trigger ──

  describe("POST /trigger", () => {
    it("CRON_SECRET 인증 성공 → handleCron 호출 + 결과 반환", async () => {
      const cronResults = [
        { job: "briefing", success: true, details: {}, durationMs: 10 },
      ];
      mockHandleCron.mockResolvedValue(cronResults);

      const env = createMockEnv();
      const req = new Request("http://localhost/trigger?cron=0+0+*+*+*", {
        method: "POST",
        headers: { Authorization: "Bearer test-cron-secret" },
      });

      const res = await worker.fetch(req, env);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(mockHandleCron).toHaveBeenCalledWith("0 0 * * *", env);
      expect(body).toEqual({
        cron: "0 0 * * *",
        results: cronResults,
      });
    });

    it("인증 실패 (잘못된 Bearer) → 401", async () => {
      const env = createMockEnv();
      const req = new Request("http://localhost/trigger?cron=0+0+*+*+*", {
        method: "POST",
        headers: { Authorization: "Bearer wrong-secret" },
      });

      const res = await worker.fetch(req, env);
      const body = await res.json();

      expect(res.status).toBe(401);
      expect((body as Record<string, unknown>).error).toBe("Unauthorized");
      expect(mockHandleCron).not.toHaveBeenCalled();
    });

    it("cron 파라미터 누락 → 400", async () => {
      const env = createMockEnv();
      const req = new Request("http://localhost/trigger", {
        method: "POST",
        headers: { Authorization: "Bearer test-cron-secret" },
      });

      const res = await worker.fetch(req, env);
      const body = await res.json();

      expect(res.status).toBe(400);
      expect((body as Record<string, unknown>).error).toBe("cron query parameter required");
      expect(mockHandleCron).not.toHaveBeenCalled();
    });
  });

  // ── 404 ──

  describe("알 수 없는 경로", () => {
    it("GET /unknown → 404", async () => {
      const env = createMockEnv();
      const req = new Request("http://localhost/unknown");

      const res = await worker.fetch(req, env);
      const body = await res.json();

      expect(res.status).toBe(404);
      expect((body as Record<string, unknown>).error).toBe("Not Found");
    });
  });
});

// ─── scheduled() + logCronResults ─────────────────────────────────

describe("collab-worker scheduled()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("handleCron 결과를 D1에 기록한다 (logCronResults)", async () => {
    const cronResults = [
      { job: "briefing", success: true, details: {}, durationMs: 10 },
    ];
    mockHandleCron.mockResolvedValue(cronResults);

    const db = createMockDb();
    const env = createMockEnv({ DB: db as unknown as D1Database });

    // waitUntil의 Promise를 실제로 실행하기 위한 캡처
    let waitUntilPromise: Promise<unknown> | undefined;
    const ctx = {
      waitUntil: vi.fn((p: Promise<unknown>) => {
        waitUntilPromise = p;
      }),
    } as unknown as ExecutionContext;

    const event = { cron: "0 0 * * *" } as ScheduledEvent;

    await worker.scheduled(event, env, ctx);
    // waitUntil에 전달된 Promise 완료 대기
    await waitUntilPromise;

    expect(db.prepare).toHaveBeenCalled();
    // INSERT INTO cron_logs SQL 확인
    const sql = db.prepare.mock.calls[0][0] as string;
    expect(sql).toContain("INSERT INTO cron_logs");
    expect(db._bind).toHaveBeenCalledWith(
      "0 0 * * *",
      JSON.stringify(cronResults),
    );
    expect(db._run).toHaveBeenCalled();
  });

  it("logCronResults — DB 에러 시 조용히 실패 (에러 안 던짐)", async () => {
    mockHandleCron.mockResolvedValue([]);

    const db = createMockDb();
    db._run.mockRejectedValue(new Error("cron_logs 테이블 없음"));

    const env = createMockEnv({ DB: db as unknown as D1Database });

    let waitUntilPromise: Promise<unknown> | undefined;
    const ctx = {
      waitUntil: vi.fn((p: Promise<unknown>) => {
        waitUntilPromise = p;
      }),
    } as unknown as ExecutionContext;

    const event = { cron: "0 0 * * *" } as ScheduledEvent;

    // scheduled() 자체가 에러를 던지지 않아야 함
    await worker.scheduled(event, env, ctx);
    // logCronResults의 catch가 에러를 무시하므로 reject되지 않아야 함
    await expect(waitUntilPromise).resolves.toBeUndefined();
  });
});
