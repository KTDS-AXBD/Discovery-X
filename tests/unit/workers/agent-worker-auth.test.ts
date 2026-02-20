/**
 * agent-worker HMAC 인증 로직 테스트
 *
 * agent-worker/src/index.ts의 authenticate() 함수는 모듈 비공개(private)이므로,
 * Worker fetch handler를 통해 간접 테스트한다.
 * 유효한 HMAC 토큰이면 DO로 포워딩되고, 실패하면 401을 반환하는 구조.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── 헬퍼: HMAC 서명 생성 ────────────────────────────────────────────

const SESSION_SECRET = "test-session-secret-key";

async function generateHMAC(
  secret: string,
  data: string,
): Promise<string> {
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

// ─── Mock 환경 ───────────────────────────────────────────────────────

function createMockEnv() {
  const mockStub = {
    fetch: vi.fn().mockResolvedValue(Response.json({ ok: true })),
  };
  return {
    DB: {} as unknown,
    AGENT_SESSION: {
      idFromName: vi.fn().mockReturnValue("do-id-123"),
      get: vi.fn().mockReturnValue(mockStub),
    },
    ANTHROPIC_API_KEY: "test-key",
    SESSION_SECRET,
    FF_AGENT_DO: "true",
    __stub: mockStub,
  };
}

// ─── 테스트 ──────────────────────────────────────────────────────────

describe("agent-worker 인증", () => {
  let worker: { fetch: (req: Request, env: unknown) => Promise<Response> };
  let env: ReturnType<typeof createMockEnv>;

  beforeEach(async () => {
    // Worker 모듈의 default export를 동적 import
    const mod = await import("../../../agent-worker/src/index");
    worker = mod.default as typeof worker;
    env = createMockEnv();
  });

  it("유효한 HMAC 토큰 → DO로 포워딩 (200)", async () => {
    const userId = "user-123";
    const token = await generateHMAC(SESSION_SECRET, userId);

    const req = new Request("https://agent.test/chat", {
      method: "POST",
      headers: {
        "X-DX-User-Id": userId,
        "X-DX-Auth-Token": token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: "hello" }),
    });

    const res = await worker.fetch(req, env);
    expect(res.status).toBe(200);
    // DO stub.fetch가 호출되었는지 확인
    expect(env.__stub.fetch).toHaveBeenCalledOnce();
  });

  it("잘못된 HMAC 토큰 → 401", async () => {
    const userId = "user-123";
    const wrongToken = "a".repeat(64); // 잘못된 서명

    const req = new Request("https://agent.test/chat", {
      method: "POST",
      headers: {
        "X-DX-User-Id": userId,
        "X-DX-Auth-Token": wrongToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: "hello" }),
    });

    const res = await worker.fetch(req, env);
    expect(res.status).toBe(401);

    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Unauthorized");
  });

  it("X-DX-User-Id 헤더 누락 → 401", async () => {
    const token = await generateHMAC(SESSION_SECRET, "user-123");

    const req = new Request("https://agent.test/chat", {
      method: "POST",
      headers: {
        "X-DX-Auth-Token": token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: "hello" }),
    });

    const res = await worker.fetch(req, env);
    expect(res.status).toBe(401);
  });

  it("X-DX-Auth-Token 헤더 누락 → 401", async () => {
    const req = new Request("https://agent.test/chat", {
      method: "POST",
      headers: {
        "X-DX-User-Id": "user-123",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: "hello" }),
    });

    const res = await worker.fetch(req, env);
    expect(res.status).toBe(401);
  });

  it("잘못된 hex 형식 토큰 → 401 (예외 처리)", async () => {
    const req = new Request("https://agent.test/chat", {
      method: "POST",
      headers: {
        "X-DX-User-Id": "user-123",
        "X-DX-Auth-Token": "not-valid-hex-zzzz",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: "hello" }),
    });

    const res = await worker.fetch(req, env);
    expect(res.status).toBe(401);
  });

  it("다른 userId로 서명한 토큰 → 401", async () => {
    const token = await generateHMAC(SESSION_SECRET, "user-other");

    const req = new Request("https://agent.test/chat", {
      method: "POST",
      headers: {
        "X-DX-User-Id": "user-123", // 서명은 user-other로 함
        "X-DX-Auth-Token": token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: "hello" }),
    });

    const res = await worker.fetch(req, env);
    expect(res.status).toBe(401);
  });

  it("유효 인증 시 올바른 userId로 DO를 조회한다", async () => {
    const userId = "user-abc";
    const token = await generateHMAC(SESSION_SECRET, userId);

    const req = new Request("https://agent.test/chat", {
      method: "POST",
      headers: {
        "X-DX-User-Id": userId,
        "X-DX-Auth-Token": token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: "hello" }),
    });

    await worker.fetch(req, env);

    // idFromName이 userId로 호출되었는지 검증
    expect(env.AGENT_SESSION.idFromName).toHaveBeenCalledWith(userId);
    expect(env.AGENT_SESSION.get).toHaveBeenCalledWith("do-id-123");
  });
});
