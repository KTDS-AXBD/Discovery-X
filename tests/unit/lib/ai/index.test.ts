import { describe, it, expect, vi, beforeEach } from "vitest";
import { callLLM, callLLMStream } from "~/lib/ai";

// Mock claude-client
vi.mock("~/lib/agent/claude-client", () => ({
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

// Mock FallbackManager to avoid provider imports
const mockCall = vi.fn().mockResolvedValue({
  id: "fallback-test",
  type: "message",
  role: "assistant",
  content: [{ type: "text", text: "Fallback Hello" }],
  model: "gpt-4o",
  stop_reason: "end_turn",
  usage: { input_tokens: 10, output_tokens: 5 },
});
const mockCallStream = vi.fn().mockResolvedValue(new ReadableStream());

vi.mock("~/lib/ai/fallback-manager", () => {
  return {
    FallbackManager: class MockFallbackManager {
      call = mockCall;
      callStream = mockCallStream;
    },
  };
});

import { callClaude, callClaudeStream } from "~/lib/agent/claude-client";

const baseRequest = {
  max_tokens: 1024,
  messages: [{ role: "user" as const, content: "Hi" }],
};

describe("callLLM", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses callClaude directly when FF is off (no context)", async () => {
    const result = await callLLM("sk-test", baseRequest);
    expect(callClaude).toHaveBeenCalledOnce();
    expect(mockCall).not.toHaveBeenCalled();
    expect(result.content[0].text).toBe("Hello");
  });

  it("uses callClaude directly when FF is off (explicit false)", async () => {
    await callLLM("sk-test", baseRequest, { env: { FF_AI_FALLBACK: "false" } });
    expect(callClaude).toHaveBeenCalledOnce();
    expect(mockCall).not.toHaveBeenCalled();
  });

  it("uses FallbackManager when FF is on", async () => {
    const result = await callLLM("sk-test", baseRequest, { env: { FF_AI_FALLBACK: "true" } });
    expect(mockCall).toHaveBeenCalledOnce();
    expect(callClaude).not.toHaveBeenCalled();
    expect(result.content[0].text).toBe("Fallback Hello");
  });
});

describe("callLLMStream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses callClaudeStream directly when FF is off", async () => {
    await callLLMStream("sk-test", baseRequest);
    expect(callClaudeStream).toHaveBeenCalledOnce();
    expect(mockCallStream).not.toHaveBeenCalled();
  });

  it("uses FallbackManager when FF is on", async () => {
    await callLLMStream("sk-test", baseRequest, { env: { FF_AI_FALLBACK: "true" } });
    expect(mockCallStream).toHaveBeenCalledOnce();
    expect(callClaudeStream).not.toHaveBeenCalled();
  });
});
