import { describe, it, expect } from "vitest";
import { openaiProvider } from "~/lib/ai/providers/openai";

describe("openaiProvider", () => {
  it("has correct id and capabilities", () => {
    expect(openaiProvider.id).toBe("openai");
    expect(openaiProvider.capabilities.supportsTools).toBe(true);
    expect(openaiProvider.capabilities.supportsStreaming).toBe(true);
  });

  describe("isCreditExhausted", () => {
    it("detects 402", () => {
      expect(openaiProvider.isCreditExhausted(new Error("OpenAI API error 402: payment required"))).toBe(true);
    });

    it("detects insufficient_quota", () => {
      expect(openaiProvider.isCreditExhausted(new Error("insufficient_quota: you exceeded your billing limit"))).toBe(true);
    });

    it("detects billing_hard_limit_reached", () => {
      expect(openaiProvider.isCreditExhausted(new Error("billing_hard_limit_reached"))).toBe(true);
    });

    it("detects 429 + quota together", () => {
      expect(openaiProvider.isCreditExhausted(new Error("OpenAI API error 429: quota exceeded"))).toBe(true);
    });

    it("does NOT detect plain 429 rate limit", () => {
      expect(openaiProvider.isCreditExhausted(new Error("OpenAI API error 429: rate limit"))).toBe(false);
    });

    it("does NOT detect server error", () => {
      expect(openaiProvider.isCreditExhausted(new Error("OpenAI API error 500: internal"))).toBe(false);
    });
  });
});
