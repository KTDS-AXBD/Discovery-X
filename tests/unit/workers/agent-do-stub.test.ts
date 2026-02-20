/**
 * AgentDO 클라이언트 스텁 테스트
 *
 * app/lib/agent/agent-do.stub.ts의 isAgentDOAvailable(), delegateToDO() 검증.
 * HMAC 서명 생성 + fetch 호출을 검사.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isAgentDOAvailable, delegateToDO } from "~/lib/agent/agent-do.stub";
import type { AgentDOChatPayload } from "~/lib/agent/agent-do.stub";

// ─── 테스트: isAgentDOAvailable ──────────────────────────────────────

describe("isAgentDOAvailable", () => {
  it('FF_AGENT_DO "true" → true', () => {
    const env = { FF_AGENT_DO: "true" };
    expect(isAgentDOAvailable(env)).toBe(true);
  });

  it('FF_AGENT_DO "false" → false', () => {
    const env = { FF_AGENT_DO: "false" };
    expect(isAgentDOAvailable(env)).toBe(false);
  });

  it("FF_AGENT_DO 키 없음 → false", () => {
    const env = {};
    expect(isAgentDOAvailable(env)).toBe(false);
  });

  it('FF_AGENT_DO "TRUE" (대문자) → false (strict equality)', () => {
    const env = { FF_AGENT_DO: "TRUE" };
    expect(isAgentDOAvailable(env)).toBe(false);
  });

  it("FF_AGENT_DO undefined → false", () => {
    const env = { FF_AGENT_DO: undefined };
    expect(isAgentDOAvailable(env)).toBe(false);
  });
});

// ─── 테스트: delegateToDO ────────────────────────────────────────────

describe("delegateToDO", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const defaultPayload: AgentDOChatPayload = {
    conversationId: "conv-123",
    message: "테스트 메시지",
    mode: "default",
    userId: "user-456",
    tenantId: "tenant-789",
  };

  const defaultEnv = {
    SESSION_SECRET: "stub-test-secret",
    AGENT_WORKER_URL: "https://custom-agent.test",
  };

  it("HMAC 서명이 포함된 요청을 보낸다", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response("ok"));
    globalThis.fetch = mockFetch;

    await delegateToDO(defaultPayload, defaultEnv);

    expect(mockFetch).toHaveBeenCalledOnce();

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];

    // URL 확인
    expect(url).toBe("https://custom-agent.test/chat");

    // 메서드 확인
    expect(init.method).toBe("POST");

    // 인증 헤더 확인
    const headers = init.headers as Record<string, string>;
    expect(headers["X-DX-User-Id"]).toBe("user-456");
    expect(headers["X-DX-Auth-Token"]).toBeTruthy();
    // HMAC hex 형식 (64자 = SHA-256)
    expect(headers["X-DX-Auth-Token"]).toMatch(/^[0-9a-f]{64}$/);
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("요청 body에 payload 전체가 포함된다", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response("ok"));
    globalThis.fetch = mockFetch;

    await delegateToDO(defaultPayload, defaultEnv);

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;

    expect(body.conversationId).toBe("conv-123");
    expect(body.message).toBe("테스트 메시지");
    expect(body.mode).toBe("default");
    expect(body.userId).toBe("user-456");
    expect(body.tenantId).toBe("tenant-789");
  });

  it("커스텀 AGENT_WORKER_URL 사용", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response("ok"));
    globalThis.fetch = mockFetch;

    const customEnv = {
      SESSION_SECRET: "secret",
      AGENT_WORKER_URL: "https://my-custom-worker.example.com",
    };

    await delegateToDO(defaultPayload, customEnv);

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://my-custom-worker.example.com/chat");
  });

  it("AGENT_WORKER_URL 없으면 기본 URL 사용", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response("ok"));
    globalThis.fetch = mockFetch;

    const envWithoutUrl = {
      SESSION_SECRET: "secret",
    };

    await delegateToDO(defaultPayload, envWithoutUrl);

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://agent-worker.dx.minu.best/chat");
  });

  it("생성된 HMAC 토큰으로 Worker 인증이 가능하다 (양방향 검증)", async () => {
    // delegateToDO가 생성한 토큰을 Worker 측 검증 로직으로 확인
    const secret = "roundtrip-secret";
    const userId = "user-roundtrip";

    let capturedToken = "";
    globalThis.fetch = vi.fn().mockImplementation(async (_url, init) => {
      const headers = (init as RequestInit).headers as Record<string, string>;
      capturedToken = headers["X-DX-Auth-Token"];
      return new Response("ok");
    });

    await delegateToDO(
      { ...defaultPayload, userId },
      { SESSION_SECRET: secret },
    );

    // 캡처한 토큰을 Worker 측 검증 로직으로 확인
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );

    const sigBytes = new Uint8Array(
      (capturedToken.match(/.{2}/g) ?? []).map((b) => parseInt(b, 16)),
    );
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes,
      encoder.encode(userId),
    );

    expect(valid).toBe(true);
  });

  it("Response 객체를 그대로 반환한다", async () => {
    const sseResponse = new Response("event: text\ndata: hello\n\n", {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });
    globalThis.fetch = vi.fn().mockResolvedValue(sseResponse);

    const result = await delegateToDO(defaultPayload, defaultEnv);

    expect(result).toBe(sseResponse);
    expect(result.headers.get("Content-Type")).toBe("text/event-stream");
  });
});
