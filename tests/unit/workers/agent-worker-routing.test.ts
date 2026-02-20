/**
 * agent-worker Worker 라우팅 테스트
 *
 * Worker fetch handler의 라우팅 동작 검증:
 * - GET /health → 200 + JSON
 * - 인증 실패 → 401
 * - 인증 성공 → DO stub.fetch 포워딩
 * - 모든 경로는 DO로 포워딩 (DO가 404 처리)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── HMAC 헬퍼 ──────────────────────────────────────────────────────

const SESSION_SECRET = "routing-test-secret";

async function generateHMAC(secret: string, data: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Mock ─────────────────────────────────────────────────────────

function createMockEnv(stubResponse?: Response) {
  const mockStub = {
    fetch: vi.fn().mockResolvedValue(
      stubResponse ?? new Response("Not found", { status: 404 }),
    ),
  };
  return {
    DB: {} as unknown,
    AGENT_SESSION: {
      idFromName: vi.fn().mockReturnValue("do-id"),
      get: vi.fn().mockReturnValue(mockStub),
    },
    ANTHROPIC_API_KEY: "test-key",
    SESSION_SECRET,
    FF_AGENT_DO: "true",
    __stub: mockStub,
  };
}

async function makeAuthenticatedRequest(
  url: string,
  method = "GET",
  body?: string,
) {
  const userId = "user-test";
  const token = await generateHMAC(SESSION_SECRET, userId);
  return new Request(url, {
    method,
    headers: {
      "X-DX-User-Id": userId,
      "X-DX-Auth-Token": token,
      "Content-Type": "application/json",
    },
    ...(body ? { body } : {}),
  });
}

// ─── 테스트 ──────────────────────────────────────────────────────────

describe("agent-worker 라우팅", () => {
  let worker: { fetch: (req: Request, env: unknown) => Promise<Response> };

  beforeEach(async () => {
    const mod = await import("../../../agent-worker/src/index");
    worker = mod.default as typeof worker;
  });

  // ─── Health Check ──────────────────────────────────────────────

  describe("GET /health", () => {
    it("200 + JSON 상태 정보를 반환한다", async () => {
      const env = createMockEnv();
      const req = new Request("https://agent.test/health");

      const res = await worker.fetch(req, env);
      expect(res.status).toBe(200);

      const body = (await res.json()) as {
        status: string;
        timestamp: string;
        worker: string;
      };
      expect(body.status).toBe("ok");
      expect(body.worker).toBe("agent-worker");
      expect(body.timestamp).toBeTruthy();
    });

    it("인증 없이도 접근 가능하다", async () => {
      const env = createMockEnv();
      const req = new Request("https://agent.test/health");
      // 인증 헤더 없이 요청

      const res = await worker.fetch(req, env);
      expect(res.status).toBe(200);
    });
  });

  // ─── 인증 실패 ──────────────────────────────────────────────────

  describe("인증 실패", () => {
    it("인증 없는 non-health 요청 → 401", async () => {
      const env = createMockEnv();
      const req = new Request("https://agent.test/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "hello" }),
      });

      const res = await worker.fetch(req, env);
      expect(res.status).toBe(401);
    });
  });

  // ─── DO 포워딩 ──────────────────────────────────────────────────

  describe("DO 포워딩", () => {
    it("인증 성공 시 DO stub.fetch를 호출한다", async () => {
      const env = createMockEnv(Response.json({ ok: true }));
      const req = await makeAuthenticatedRequest(
        "https://agent.test/chat",
        "POST",
        JSON.stringify({ message: "hello" }),
      );

      const res = await worker.fetch(req, env);
      expect(env.__stub.fetch).toHaveBeenCalledOnce();
      expect(res.status).toBe(200);
    });

    it("알 수 없는 경로도 DO로 포워딩한다 (DO가 404 반환)", async () => {
      const env = createMockEnv(new Response("Not found", { status: 404 }));
      const req = await makeAuthenticatedRequest(
        "https://agent.test/unknown-path",
      );

      const res = await worker.fetch(req, env);
      expect(res.status).toBe(404);
      expect(env.__stub.fetch).toHaveBeenCalledOnce();
    });

    it("DO에 원본 Request를 그대로 전달한다", async () => {
      const env = createMockEnv(Response.json({ forwarded: true }));
      const req = await makeAuthenticatedRequest(
        "https://agent.test/status",
      );

      await worker.fetch(req, env);

      // stub.fetch에 전달된 Request 객체 확인
      const passedReq = env.__stub.fetch.mock.calls[0][0] as Request;
      expect(new URL(passedReq.url).pathname).toBe("/status");
    });
  });
});
