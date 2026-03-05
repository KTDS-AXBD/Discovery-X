import { describe, it, expect, vi, beforeEach } from "vitest";
import { FallbackManager } from "~/lib/ai/fallback-manager";
import type { FallbackContext } from "~/lib/ai/types";

// Mock providers
vi.mock("~/lib/ai/providers/anthropic", () => ({
  anthropicProvider: {
    id: "anthropic",
    capabilities: { supportsTools: true, supportsStreaming: true },
    call: vi.fn(),
    callStream: vi.fn(),
    parseStream: vi.fn(),
    isCreditExhausted: vi.fn(),
  },
}));

vi.mock("~/lib/ai/providers/openai", () => ({
  openaiProvider: {
    id: "openai",
    capabilities: { supportsTools: true, supportsStreaming: true },
    call: vi.fn(),
    callStream: vi.fn(),
    parseStream: vi.fn(),
    isCreditExhausted: vi.fn(),
  },
}));

vi.mock("~/lib/ai/providers/google", () => ({
  googleProvider: {
    id: "google",
    capabilities: { supportsTools: true, supportsStreaming: true },
    call: vi.fn(),
    callStream: vi.fn(),
    parseStream: vi.fn(),
    isCreditExhausted: vi.fn(),
  },
}));

vi.mock("~/lib/ai/providers/workers-ai", () => ({
  workersAIProvider: {
    id: "workers-ai",
    capabilities: { supportsTools: false, supportsStreaming: false },
    call: vi.fn(),
    callStream: vi.fn(),
    parseStream: vi.fn(),
    isCreditExhausted: vi.fn(),
  },
}));

import { anthropicProvider } from "~/lib/ai/providers/anthropic";
import { openaiProvider } from "~/lib/ai/providers/openai";
import { googleProvider } from "~/lib/ai/providers/google";
import { workersAIProvider } from "~/lib/ai/providers/workers-ai";

const mockResponse = {
  id: "test-id",
  type: "message" as const,
  role: "assistant" as const,
  content: [{ type: "text" as const, text: "Hello" }],
  model: "test",
  stop_reason: "end_turn" as const,
  usage: { input_tokens: 10, output_tokens: 5 },
};

const baseRequest = {
  max_tokens: 1024,
  messages: [{ role: "user" as const, content: "Hi" }],
};

const ctx: FallbackContext = {
  env: {
    FF_AI_FALLBACK: "true",
    OPENAI_API_KEY: "sk-test",
    GOOGLE_AI_API_KEY: "gai-test",
  },
};

describe("FallbackManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("call", () => {
    it("uses primary provider when available", async () => {
      vi.mocked(anthropicProvider.call).mockResolvedValue(mockResponse);

      const manager = new FallbackManager(ctx);
      const result = await manager.call("sk-ant-test", baseRequest);

      expect(result).toEqual(mockResponse);
      expect(anthropicProvider.call).toHaveBeenCalledOnce();
      expect(openaiProvider.call).not.toHaveBeenCalled();
    });

    it("falls back on credit exhaustion (402)", async () => {
      const creditError = new Error("Claude API error 402: credit exhausted");
      vi.mocked(anthropicProvider.call).mockRejectedValue(creditError);
      vi.mocked(anthropicProvider.isCreditExhausted).mockReturnValue(true);
      vi.mocked(openaiProvider.call).mockResolvedValue(mockResponse);

      const manager = new FallbackManager(ctx);
      const result = await manager.call("sk-ant-test", baseRequest);

      expect(result).toEqual(mockResponse);
      expect(anthropicProvider.call).toHaveBeenCalledOnce();
      expect(openaiProvider.call).toHaveBeenCalledOnce();
    });

    it("re-throws non-credit errors (does NOT fall back)", async () => {
      const serverError = new Error("Claude API error 500: internal server error");
      vi.mocked(anthropicProvider.call).mockRejectedValue(serverError);
      vi.mocked(anthropicProvider.isCreditExhausted).mockReturnValue(false);

      const manager = new FallbackManager(ctx);
      await expect(manager.call("sk-ant-test", baseRequest)).rejects.toThrow("500");
      expect(openaiProvider.call).not.toHaveBeenCalled();
    });

    it("throws when all providers exhausted", async () => {
      const creditError = new Error("credit exhausted");
      vi.mocked(anthropicProvider.call).mockRejectedValue(creditError);
      vi.mocked(anthropicProvider.isCreditExhausted).mockReturnValue(true);
      vi.mocked(openaiProvider.call).mockRejectedValue(creditError);
      vi.mocked(openaiProvider.isCreditExhausted).mockReturnValue(true);
      vi.mocked(googleProvider.call).mockRejectedValue(creditError);
      vi.mocked(googleProvider.isCreditExhausted).mockReturnValue(true);
      vi.mocked(workersAIProvider.call).mockRejectedValue(creditError);
      vi.mocked(workersAIProvider.isCreditExhausted).mockReturnValue(true);

      const manager = new FallbackManager(ctx);
      await expect(manager.call("sk-ant-test", baseRequest)).rejects.toThrow("모든 AI 프로바이더");
    });

    it("skips workers-ai for tool-use requests", async () => {
      const creditError = new Error("credit exhausted");
      vi.mocked(anthropicProvider.call).mockRejectedValue(creditError);
      vi.mocked(anthropicProvider.isCreditExhausted).mockReturnValue(true);
      vi.mocked(openaiProvider.call).mockRejectedValue(creditError);
      vi.mocked(openaiProvider.isCreditExhausted).mockReturnValue(true);
      vi.mocked(googleProvider.call).mockRejectedValue(creditError);
      vi.mocked(googleProvider.isCreditExhausted).mockReturnValue(true);

      const toolRequest = {
        ...baseRequest,
        tools: [{ name: "test", description: "test", input_schema: {} }],
      };

      const manager = new FallbackManager(ctx);
      await expect(manager.call("sk-ant-test", toolRequest)).rejects.toThrow("모든 AI 프로바이더");
      // Workers AI should not have been called because it doesn't support tools
      expect(workersAIProvider.call).not.toHaveBeenCalled();
    });

    it("skips providers without API keys", async () => {
      const creditError = new Error("credit exhausted");
      vi.mocked(anthropicProvider.call).mockRejectedValue(creditError);
      vi.mocked(anthropicProvider.isCreditExhausted).mockReturnValue(true);

      // No OpenAI key
      const noKeyCtx: FallbackContext = {
        env: { FF_AI_FALLBACK: "true", GOOGLE_AI_API_KEY: "gai-test" },
      };

      vi.mocked(googleProvider.call).mockResolvedValue(mockResponse);

      const manager = new FallbackManager(noKeyCtx);
      const result = await manager.call("sk-ant-test", baseRequest);

      expect(result).toEqual(mockResponse);
      expect(openaiProvider.call).not.toHaveBeenCalled();
      expect(googleProvider.call).toHaveBeenCalledOnce();
    });
  });

  describe("callStream", () => {
    it("skips workers-ai for streaming (no streaming support)", async () => {
      const creditError = new Error("credit exhausted");
      vi.mocked(anthropicProvider.callStream).mockRejectedValue(creditError);
      vi.mocked(anthropicProvider.isCreditExhausted).mockReturnValue(true);
      vi.mocked(openaiProvider.callStream).mockRejectedValue(creditError);
      vi.mocked(openaiProvider.isCreditExhausted).mockReturnValue(true);
      vi.mocked(googleProvider.callStream).mockRejectedValue(creditError);
      vi.mocked(googleProvider.isCreditExhausted).mockReturnValue(true);

      const manager = new FallbackManager(ctx);
      await expect(manager.callStream("sk-ant-test", baseRequest)).rejects.toThrow("스트리밍 가능한 AI 프로바이더");
      expect(workersAIProvider.callStream).not.toHaveBeenCalled();
    });
  });
});
