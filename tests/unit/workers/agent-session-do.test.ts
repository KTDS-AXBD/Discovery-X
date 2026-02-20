/**
 * AgentSessionDO 핵심 로직 테스트
 *
 * DO는 Cloudflare 런타임에서만 동작하므로,
 * 클래스를 직접 인스턴스화하고 state/env를 모킹하여 테스트한다.
 *
 * ⚠️ 주의: constructor 내 blockConcurrencyWhile는 비동기로 실행되므로,
 * 저장된 상태 복원이 필요한 테스트에서는 flushMicrotasks()를 호출한다.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── DurableObject 글로벌 타입 polyfill ──────────────────────────────

if (typeof (globalThis as unknown as Record<string, unknown>).DurableObject === "undefined") {
  (globalThis as unknown as Record<string, unknown>).DurableObject = class {};
}

// ─── 헬퍼 ────────────────────────────────────────────────────────────

/** constructor의 비동기 초기화가 완료되도록 마이크로태스크 flush */
async function flushMicrotasks() {
  await new Promise((r) => setTimeout(r, 0));
}

// ─── Mock 팩토리 ─────────────────────────────────────────────────────

function createMockStorage(initialSession?: Record<string, unknown>) {
  const store = new Map<string, unknown>();
  if (initialSession) {
    store.set("session", initialSession);
  }

  return {
    get: vi.fn(async <T>(key: string) => store.get(key) as T | undefined),
    put: vi.fn(async (key: string, value: unknown) => {
      store.set(key, value);
    }),
    delete: vi.fn(async (key: string) => store.delete(key)),
    deleteAll: vi.fn(async () => store.clear()),
    setAlarm: vi.fn(),
    _store: store,
  };
}

function createMockState(storage: ReturnType<typeof createMockStorage>) {
  return {
    storage,
    blockConcurrencyWhile: vi.fn(async (fn: () => Promise<void>) => fn()),
  };
}

function createMockDb() {
  const mockRun = vi.fn().mockResolvedValue({ success: true });
  const mockFirst = vi.fn().mockResolvedValue(null);
  const mockBind = vi.fn().mockReturnValue({ run: mockRun, first: mockFirst });
  const mockPrepare = vi.fn().mockReturnValue({ bind: mockBind });

  return {
    prepare: mockPrepare,
    __bind: mockBind,
    __run: mockRun,
    __first: mockFirst,
  };
}

function createMockEnv(db?: ReturnType<typeof createMockDb>) {
  return {
    DB: db ?? createMockDb(),
    AGENT_SESSION: { idFromName: vi.fn(), get: vi.fn() },
    ANTHROPIC_API_KEY: "test-anthropic-key",
    SESSION_SECRET: "test-secret",
    FF_AGENT_DO: "true",
  };
}

// ─── DO 타입 ─────────────────────────────────────────────────────────

type DOInstance = {
  fetch: (req: Request) => Promise<Response>;
  alarm: () => Promise<void>;
};

// ─── 테스트 ──────────────────────────────────────────────────────────

describe("AgentSessionDO", () => {
  let AgentSessionDO: new (state: unknown, env: unknown) => DOInstance;

  beforeEach(async () => {
    const mod = await import("../../../agent-worker/src/agent-session");
    AgentSessionDO = mod.AgentSessionDO as unknown as typeof AgentSessionDO;
  });

  // ─── /status 엔드포인트 ─────────────────────────────────────────

  describe("fetch /status", () => {
    it("상태 JSON을 반환한다", async () => {
      const storage = createMockStorage();
      const state = createMockState(storage);
      const env = createMockEnv();
      const doInstance = new AgentSessionDO(state, env);

      const req = new Request("https://do.test/status");
      const res = await doInstance.fetch(req);

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        isProcessing: boolean;
        tokenCount: number;
        lastActivityAt: number;
        userId: string;
      };
      expect(body.isProcessing).toBe(false);
      expect(body.tokenCount).toBe(0);
      expect(typeof body.lastActivityAt).toBe("number");
      expect(body.userId).toBe("");
    });

    it("복원된 세션 상태를 반영한다", async () => {
      const stored = {
        userId: "user-restored",
        tenantId: "tenant-1",
        tokenCount: 500,
        lastActivityAt: 1700000000000,
      };
      const storage = createMockStorage(stored);
      const state = createMockState(storage);
      const env = createMockEnv();
      const doInstance = new AgentSessionDO(state, env);

      // constructor의 비동기 초기화 완료 대기
      await flushMicrotasks();

      const req = new Request("https://do.test/status");
      const res = await doInstance.fetch(req);
      const body = (await res.json()) as {
        userId: string;
        tokenCount: number;
        lastActivityAt: number;
      };

      expect(body.userId).toBe("user-restored");
      expect(body.tokenCount).toBe(500);
      expect(body.lastActivityAt).toBe(1700000000000);
    });
  });

  // ─── POST /chat 입력 검증 ──────────────────────────────────────

  describe("fetch POST /chat — 입력 검증", () => {
    it("빈 message → 400 에러", async () => {
      const storage = createMockStorage();
      const state = createMockState(storage);
      const env = createMockEnv();
      const doInstance = new AgentSessionDO(state, env);

      const req = new Request("https://do.test/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: "conv-1",
          message: "",
          userId: "user-1",
          tenantId: "t-1",
        }),
      });

      const res = await doInstance.fetch(req);
      expect(res.status).toBe(400);

      const body = (await res.json()) as { error: string };
      expect(body.error).toContain("conversationId와 message가 필요합니다");
    });

    it("conversationId 누락 → 400 에러", async () => {
      const storage = createMockStorage();
      const state = createMockState(storage);
      const env = createMockEnv();
      const doInstance = new AgentSessionDO(state, env);

      const req = new Request("https://do.test/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "hello",
          userId: "user-1",
          tenantId: "t-1",
        }),
      });

      const res = await doInstance.fetch(req);
      expect(res.status).toBe(400);
    });
  });

  // ─── 동시성 제어 ───────────────────────────────────────────────

  describe("동시성 제어", () => {
    it("isProcessing 중 추가 요청 → 429", async () => {
      const storage = createMockStorage();
      const state = createMockState(storage);
      const db = createMockDb();
      // checkMonthlyBudget를 영원히 대기시켜 isProcessing=true 유지
      // (handleChatRequest는 isProcessing=true 설정 → budget check → 이후 로직)
      db.__first.mockReturnValue(new Promise(() => {})); // never resolves
      const env = createMockEnv(db);
      const doInstance = new AgentSessionDO(state, env);

      const chatBody = JSON.stringify({
        conversationId: "conv-1",
        message: "first request",
        userId: "user-1",
        tenantId: "t-1",
      });

      // 첫 요청: budget check에서 hang → isProcessing = true 상태 유지
      const firstReq = new Request("https://do.test/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: chatBody,
      });
      const firstPromise = doInstance.fetch(firstReq);

      // 이벤트 루프 한 틱 대기 (isProcessing = true 상태)
      await flushMicrotasks();

      // 두 번째 요청
      const secondReq = new Request("https://do.test/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: "conv-2",
          message: "second request",
          userId: "user-1",
          tenantId: "t-1",
        }),
      });

      const secondRes = await doInstance.fetch(secondReq);
      expect(secondRes.status).toBe(429);

      const body = (await secondRes.json()) as { error: string };
      expect(body.error).toContain("다른 탭에서 대화가 진행 중");

      // firstPromise가 매달려 있지만 테스트 종료 시 GC됨
      void firstPromise;
    });
  });

  // ─── buildSystemPrompt ─────────────────────────────────────────

  describe("buildSystemPrompt", () => {
    it("soulCache 없을 때 DEFAULT_SOUL_PROMPT 사용", async () => {
      const storage = createMockStorage();
      const state = createMockState(storage);
      const db = createMockDb();
      db.__first.mockResolvedValue({ total: 0 });
      const env = createMockEnv(db);
      const doInstance = new AgentSessionDO(state, env);

      const originalFetch = globalThis.fetch;
      let capturedBody: Record<string, unknown> | null = null;
      globalThis.fetch = vi.fn().mockImplementation(async (_url, init) => {
        const reqInit = init as RequestInit;
        capturedBody = JSON.parse(reqInit.body as string) as Record<string, unknown>;
        return new Response("data: [DONE]\n\n", {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        });
      });

      const req = new Request("https://do.test/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: "conv-1",
          message: "test",
          userId: "user-1",
          tenantId: "t-1",
        }),
      });

      const res = await doInstance.fetch(req);
      // SSE 스트림을 완전히 소비해야 finally 블록이 실행됨
      const reader = res.body?.getReader();
      if (reader) {
        while (!(await reader.read()).done) { /* drain */ }
      }

      expect(capturedBody).not.toBeNull();
      const systemPrompt = capturedBody!.system as string;
      expect(systemPrompt).toContain("Discovery-X Agent");
      expect(systemPrompt).toContain("SOUL");

      globalThis.fetch = originalFetch;
    });

    it("soulCache + projectionCache 모두 있을 때 합성", async () => {
      const stored = {
        userId: "user-1",
        tenantId: "t-1",
        tokenCount: 0,
        lastActivityAt: Date.now(),
        soulCache: "# Custom Soul\n커스텀 소울 프롬프트",
        projectionCache: "이 사용자는 BD 담당자입니다.",
      };
      const storage = createMockStorage(stored);
      const state = createMockState(storage);
      const db = createMockDb();
      db.__first.mockResolvedValue({ total: 0 });
      const env = createMockEnv(db);
      const doInstance = new AgentSessionDO(state, env);

      // 비동기 초기화 대기 (soulCache, projectionCache 복원)
      await flushMicrotasks();

      const originalFetch = globalThis.fetch;
      let capturedBody: Record<string, unknown> | null = null;
      globalThis.fetch = vi.fn().mockImplementation(async (_url, init) => {
        const reqInit = init as RequestInit;
        capturedBody = JSON.parse(reqInit.body as string) as Record<string, unknown>;
        return new Response("data: [DONE]\n\n", {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        });
      });

      const req = new Request("https://do.test/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: "conv-1",
          message: "test",
          userId: "user-1",
          tenantId: "t-1",
        }),
      });

      const res = await doInstance.fetch(req);
      const reader = res.body?.getReader();
      if (reader) {
        while (!(await reader.read()).done) { /* drain */ }
      }

      expect(capturedBody).not.toBeNull();
      const systemPrompt = capturedBody!.system as string;
      // soulCache가 사용됨 (DEFAULT가 아닌 커스텀)
      expect(systemPrompt).toContain("Custom Soul");
      expect(systemPrompt).not.toContain("Discovery-X Agent — SOUL");
      // projectionCache도 포함됨
      expect(systemPrompt).toContain("사용자 프로파일");
      expect(systemPrompt).toContain("BD 담당자");

      globalThis.fetch = originalFetch;
    });
  });

  // ─── alarm ─────────────────────────────────────────────────────

  describe("alarm", () => {
    it("30분 초과 비활성 시 storage.deleteAll 호출", async () => {
      const stored = {
        userId: "user-1",
        tenantId: "t-1",
        tokenCount: 100,
        lastActivityAt: Date.now() - 31 * 60 * 1000, // 31분 전
      };
      const storage = createMockStorage(stored);
      const state = createMockState(storage);
      const db = createMockDb();
      const env = createMockEnv(db);
      const doInstance = new AgentSessionDO(state, env);

      // constructor 비동기 초기화 대기 (lastActivityAt 복원)
      await flushMicrotasks();

      await doInstance.alarm();

      expect(storage.deleteAll).toHaveBeenCalledOnce();
      // flushMemory도 호출됨 (DB prepare 확인)
      expect(db.prepare).toHaveBeenCalled();
    });

    it("활동 중이면 정리하지 않는다", async () => {
      const stored = {
        userId: "user-1",
        tenantId: "t-1",
        tokenCount: 100,
        lastActivityAt: Date.now(), // 방금 활동
      };
      const storage = createMockStorage(stored);
      const state = createMockState(storage);
      const env = createMockEnv();
      const doInstance = new AgentSessionDO(state, env);

      await flushMicrotasks();

      await doInstance.alarm();

      expect(storage.deleteAll).not.toHaveBeenCalled();
    });
  });

  // ─── persistState ──────────────────────────────────────────────

  describe("persistState (간접 테스트)", () => {
    it("/chat 처리 완료 후 storage.put 호출", async () => {
      const storage = createMockStorage();
      const state = createMockState(storage);
      const db = createMockDb();
      db.__first.mockResolvedValue({ total: 0 });
      const env = createMockEnv(db);
      const doInstance = new AgentSessionDO(state, env);

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response("data: [DONE]\n\n", {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        }),
      );

      const req = new Request("https://do.test/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: "conv-1",
          message: "persist test",
          userId: "user-persist",
          tenantId: "t-1",
        }),
      });

      const res = await doInstance.fetch(req);
      // 스트림 소비 → finally 블록 실행
      const reader = res.body?.getReader();
      if (reader) {
        while (!(await reader.read()).done) { /* drain */ }
      }

      // persistState가 호출되어 storage.put("session", ...) 실행
      expect(storage.put).toHaveBeenCalledWith(
        "session",
        expect.objectContaining({
          userId: "user-persist",
          tenantId: "t-1",
        }),
      );

      globalThis.fetch = originalFetch;
    });
  });

  // ─── checkMonthlyBudget ────────────────────────────────────────

  describe("checkMonthlyBudget (간접 테스트)", () => {
    it("예산 미초과 시 chat 요청 정상 처리", async () => {
      const storage = createMockStorage();
      const state = createMockState(storage);
      const db = createMockDb();
      db.__first.mockResolvedValue({ total: 100000 }); // 10만 < 200만
      const env = createMockEnv(db);
      const doInstance = new AgentSessionDO(state, env);

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response("data: [DONE]\n\n", {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        }),
      );

      const req = new Request("https://do.test/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: "conv-1",
          message: "budget ok",
          userId: "user-1",
          tenantId: "t-1",
        }),
      });

      const res = await doInstance.fetch(req);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("text/event-stream");

      const reader = res.body?.getReader();
      if (reader) {
        while (!(await reader.read()).done) { /* drain */ }
      }

      globalThis.fetch = originalFetch;
    });

    it("예산 초과 시 429 반환", async () => {
      const storage = createMockStorage();
      const state = createMockState(storage);
      const db = createMockDb();
      db.__first.mockResolvedValue({ total: 3_000_000 }); // 300만 > 200만
      const env = createMockEnv(db);
      const doInstance = new AgentSessionDO(state, env);

      const req = new Request("https://do.test/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: "conv-1",
          message: "over budget",
          userId: "user-1",
          tenantId: "t-1",
        }),
      });

      const res = await doInstance.fetch(req);
      expect(res.status).toBe(429);

      const body = (await res.json()) as { error: string };
      expect(body.error).toContain("월간 토큰 예산");
    });

    it("DB 에러 시 true (fail-open) — chat 정상 진행", async () => {
      const storage = createMockStorage();
      const state = createMockState(storage);
      const db = createMockDb();
      db.__first.mockRejectedValue(new Error("D1 connection error"));
      const env = createMockEnv(db);
      const doInstance = new AgentSessionDO(state, env);

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response("data: [DONE]\n\n", {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        }),
      );

      const req = new Request("https://do.test/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: "conv-1",
          message: "db error but ok",
          userId: "user-1",
          tenantId: "t-1",
        }),
      });

      const res = await doInstance.fetch(req);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("text/event-stream");

      const reader = res.body?.getReader();
      if (reader) {
        while (!(await reader.read()).done) { /* drain */ }
      }

      globalThis.fetch = originalFetch;
    });
  });

  // ─── flushMemory (간접 테스트 via alarm) ────────────────────────

  describe("flushMemory (alarm 경유)", () => {
    it("D1 UPDATE 호출 — agent_sessions_v2", async () => {
      const stored = {
        userId: "user-flush",
        tenantId: "t-1",
        tokenCount: 250,
        lastActivityAt: Date.now() - 31 * 60 * 1000,
        conversationSummary: "test summary",
      };
      const storage = createMockStorage(stored);
      const state = createMockState(storage);
      const db = createMockDb();
      const env = createMockEnv(db);
      const doInstance = new AgentSessionDO(state, env);

      // 비동기 초기화 대기 (userId, tokenCount, lastActivityAt 등 복원)
      await flushMicrotasks();

      await doInstance.alarm();

      // DB prepare가 UPDATE 쿼리로 호출됨
      expect(db.prepare).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE agent_sessions_v2"),
      );
      // bind에 tokenCount, summary, timestamp, userId 전달
      expect(db.__bind).toHaveBeenCalledWith(
        250,                // tokenCount
        "test summary",     // conversationSummary
        expect.any(Number), // updated_at (timestamp)
        "user-flush",       // userId
      );
      expect(db.__run).toHaveBeenCalled();
    });

    it("3회 재시도 후 포기", async () => {
      const stored = {
        userId: "user-retry",
        tenantId: "t-1",
        tokenCount: 100,
        lastActivityAt: Date.now() - 31 * 60 * 1000,
      };
      const storage = createMockStorage(stored);
      const state = createMockState(storage);
      const db = createMockDb();
      // run이 계속 실패
      db.__run.mockRejectedValue(new Error("D1 write error"));
      const env = createMockEnv(db);
      const doInstance = new AgentSessionDO(state, env);

      await flushMicrotasks();

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await doInstance.alarm();

      // 3회 재시도 (run 3번 호출)
      expect(db.__run).toHaveBeenCalledTimes(3);
      // 에러 로그 출력
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("flush 실패"),
      );

      consoleSpy.mockRestore();
      // flushMemory 실패해도 deleteAll은 호출됨
      expect(storage.deleteAll).toHaveBeenCalled();
    }, 15000); // 재시도 대기(1s+2s+3s)로 인한 타임아웃 확장
  });

  // ─── 404 (알 수 없는 경로) ──────────────────────────────────────

  describe("알 수 없는 경로", () => {
    it("정의되지 않은 경로 → 404", async () => {
      const storage = createMockStorage();
      const state = createMockState(storage);
      const env = createMockEnv();
      const doInstance = new AgentSessionDO(state, env);

      const req = new Request("https://do.test/unknown");
      const res = await doInstance.fetch(req);
      expect(res.status).toBe(404);
    });
  });
});
