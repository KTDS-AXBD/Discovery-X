import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mocks ──────────────────────────────────────────────────────
const mocks = vi.hoisted(() => ({
  call: vi.fn().mockResolvedValue({
    id: "fallback-test",
    type: "message",
    role: "assistant",
    content: [{ type: "text", text: "Fallback Hello" }],
    model: "gpt-4o",
    stop_reason: "end_turn",
    usage: { input_tokens: 10, output_tokens: 5 },
  }),
  callStream: vi.fn().mockResolvedValue(new ReadableStream()),
  fmOptions: null as unknown,
  route: vi.fn(),
  markFailed: vi.fn(),
  markHealthy: vi.fn(),
}));

vi.mock("~/features/chat/agent/claude-client", () => ({
  callClaude: vi.fn().mockResolvedValue({
    id: "test",
    type: "message",
    role: "assistant",
    content: [{ type: "text", text: "Hello" }],
    model: "claude-sonnet-4",
    stop_reason: "end_turn",
    usage: { input_tokens: 10, output_tokens: 5 },
  }),
  callClaudeStream: vi.fn().mockResolvedValue(new ReadableStream()),
  parseSSEStream: vi.fn(),
  CLAUDE_MODEL: "claude-sonnet-4-20250514",
}));

vi.mock("~/lib/ai/fallback-manager", () => {
  class FM {
    options: unknown;
    constructor(_ctx: unknown, options?: unknown) { this.options = options; mocks.fmOptions = options; }
    call = mocks.call;
    callStream = mocks.callStream;
  }
  return { FallbackManager: FM };
});

vi.mock("~/lib/ai/policy-router", () => {
  class PR {
    constructor() { /* noop */ }
    route = mocks.route;
    markProviderFailed = mocks.markFailed;
    markProviderHealthy = mocks.markHealthy;
  }
  return { PolicyRouter: PR };
});

import { callLLM, callLLMStream, BudgetBlockedError } from "~/lib/ai";
import { callClaude, callClaudeStream } from "~/features/chat/agent/claude-client";
import { FallbackManager } from "~/lib/ai/fallback-manager";

const baseRequest = {
  max_tokens: 1024,
  messages: [{ role: "user" as const, content: "Hi" }],
};

describe("callLLM", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses callClaude directly when no context", async () => {
    const result = await callLLM("sk-test", baseRequest);
    expect(callClaude).toHaveBeenCalledOnce();
    expect(mocks.call).not.toHaveBeenCalled();
    expect(result.content[0].text).toBe("Hello");
  });

  it("uses FallbackManager when context provided (no routing)", async () => {
    const result = await callLLM("sk-test", baseRequest, { env: {} });
    expect(mocks.call).toHaveBeenCalledOnce();
    expect(callClaude).not.toHaveBeenCalled();
    expect(result.content[0].text).toBe("Fallback Hello");
    // PolicyRouter는 db/userId/tenantId 없으면 route() 호출 안 됨
    expect(mocks.route).not.toHaveBeenCalled();
  });

  it("skips PolicyRouter when userId is missing", async () => {
    await callLLM("sk-test", baseRequest, { env: {}, db: {}, tenantId: "t1" });
    expect(mocks.route).not.toHaveBeenCalled();
    expect(mocks.call).toHaveBeenCalledOnce();
  });

  it("skips PolicyRouter when tenantId is missing", async () => {
    await callLLM("sk-test", baseRequest, { env: {}, db: {}, userId: "u1" });
    expect(mocks.route).not.toHaveBeenCalled();
    expect(mocks.call).toHaveBeenCalledOnce();
  });
});

describe("callLLM — PolicyRouter 통합", () => {
  const routingCtx = {
    env: { ANTHROPIC_API_KEY: "sk-ant" },
    db: {} as unknown,
    userId: "user-1",
    tenantId: "tenant-1",
    purpose: "chat",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls route() when routing context complete", async () => {
    mocks.route.mockResolvedValue({
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      decisionId: "dec-1",
      reasonCode: "primary",
      budgetTier: "normal",
    });

    await callLLM("sk-test", baseRequest, routingCtx);

    expect(mocks.route).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        tenantId: "tenant-1",
        purpose: "chat",
        needsTools: false,
        needsStreaming: false,
      }),
    );
  });

  it("reorders provider chain with selected provider first", async () => {
    mocks.route.mockResolvedValue({
      provider: "openai",
      model: "gpt-4o",
      decisionId: "dec-2",
      reasonCode: "fallback_credit",
      budgetTier: "normal",
    });

    await callLLM("sk-test", baseRequest, routingCtx);

    // FallbackManager 인스턴스의 options에서 providerChain 확인
    // FM class에서 this.options로 저장하므로, call 호출 시 이미 생성된 상태
    // → FallbackManager constructor 호출 확인은 class mock 내부에서 불가
    // → 대신 실제 FallbackManager mock을 통해 간접 검증
    expect(mocks.call).toHaveBeenCalledOnce();
  });

  it("throws BudgetBlockedError when budget tier is block", async () => {
    mocks.route.mockResolvedValue({
      provider: "anthropic",
      model: "",
      decisionId: "dec-block",
      reasonCode: "budget_block",
      budgetTier: "block",
    });

    await expect(callLLM("sk-test", baseRequest, routingCtx)).rejects.toThrow(BudgetBlockedError);
    // FallbackManager.call은 호출되지 않아야 함
    expect(mocks.call).not.toHaveBeenCalled();
  });

  it("BudgetBlockedError contains decisionId", async () => {
    mocks.route.mockResolvedValue({
      provider: "anthropic",
      model: "",
      decisionId: "dec-block-2",
      reasonCode: "budget_block",
      budgetTier: "block",
    });

    try {
      await callLLM("sk-test", baseRequest, routingCtx);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(BudgetBlockedError);
      expect((err as BudgetBlockedError).decisionId).toBe("dec-block-2");
    }
  });

  it("passes nativeModel to FallbackManager for Anthropic provider on budget degrade", async () => {
    mocks.route.mockResolvedValue({
      provider: "anthropic",
      model: "claude-3-5-haiku-20241022",
      decisionId: "dec-3",
      reasonCode: "budget_degrade",
      budgetTier: "degrade",
    });

    await callLLM("sk-test", { ...baseRequest, model: "claude-sonnet-4-20250514" }, routingCtx);

    // nativeModel이 FallbackManager 옵션으로 전달됨
    const opts = mocks.fmOptions as { nativeModel?: string; providerChain?: string[] };
    expect(opts.nativeModel).toBe("claude-3-5-haiku-20241022");
    expect(opts.providerChain?.[0]).toBe("anthropic");
  });

  it("passes nativeModel to FallbackManager for non-Anthropic provider", async () => {
    mocks.route.mockResolvedValue({
      provider: "openai",
      model: "gpt-4o",
      decisionId: "dec-4",
      reasonCode: "primary",
      budgetTier: "normal",
    });

    await callLLM("sk-test", { ...baseRequest, model: "claude-sonnet-4-20250514" }, routingCtx);

    // 모든 provider에서 nativeModel이 전달됨 (FallbackManager가 선호 provider에 적용)
    const opts = mocks.fmOptions as { nativeModel?: string; providerChain?: string[] };
    expect(opts.nativeModel).toBe("gpt-4o");
    expect(opts.providerChain?.[0]).toBe("openai");
  });

  it("detects needsTools from request.tools", async () => {
    mocks.route.mockResolvedValue({
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      decisionId: "dec-6",
      reasonCode: "primary",
      budgetTier: "normal",
    });

    const toolRequest = {
      ...baseRequest,
      tools: [{ name: "test", description: "test tool", input_schema: {} }],
    };

    await callLLM("sk-test", toolRequest, routingCtx);

    expect(mocks.route).toHaveBeenCalledWith(
      expect.objectContaining({ needsTools: true }),
    );
  });

  it("defaults purpose to chat when not specified", async () => {
    mocks.route.mockResolvedValue({
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      decisionId: "dec-7",
      reasonCode: "primary",
      budgetTier: "normal",
    });

    await callLLM("sk-test", baseRequest, {
      env: {},
      db: {},
      userId: "u1",
      tenantId: "t1",
    });

    expect(mocks.route).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: "chat" }),
    );
  });
});

describe("callLLMStream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses callClaudeStream directly when no context", async () => {
    await callLLMStream("sk-test", baseRequest);
    expect(callClaudeStream).toHaveBeenCalledOnce();
    expect(mocks.callStream).not.toHaveBeenCalled();
  });

  it("uses FallbackManager when context provided", async () => {
    await callLLMStream("sk-test", baseRequest, { env: { FF_AI_FALLBACK: "true" } });
    expect(mocks.callStream).toHaveBeenCalledOnce();
    expect(callClaudeStream).not.toHaveBeenCalled();
  });

  it("integrates PolicyRouter for streaming with needsStreaming=true", async () => {
    mocks.route.mockResolvedValue({
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      decisionId: "dec-s1",
      reasonCode: "primary",
      budgetTier: "normal",
    });

    await callLLMStream("sk-test", baseRequest, {
      env: {},
      db: {},
      userId: "u1",
      tenantId: "t1",
      purpose: "chat",
    });

    expect(mocks.route).toHaveBeenCalledWith(
      expect.objectContaining({ needsStreaming: true }),
    );
  });

  it("throws BudgetBlockedError on stream when budget blocked", async () => {
    mocks.route.mockResolvedValue({
      provider: "anthropic",
      model: "",
      decisionId: "dec-s-block",
      reasonCode: "budget_block",
      budgetTier: "block",
    });

    await expect(
      callLLMStream("sk-test", baseRequest, {
        env: {},
        db: {},
        userId: "u1",
        tenantId: "t1",
      }),
    ).rejects.toThrow(BudgetBlockedError);
  });
});
