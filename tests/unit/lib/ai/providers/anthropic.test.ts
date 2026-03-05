import { describe, it, expect } from "vitest";
import { anthropicProvider } from "~/lib/ai/providers/anthropic";

describe("anthropicProvider", () => {
  it("has correct id and capabilities", () => {
    expect(anthropicProvider.id).toBe("anthropic");
    expect(anthropicProvider.capabilities.supportsTools).toBe(true);
    expect(anthropicProvider.capabilities.supportsStreaming).toBe(true);
  });

  describe("isCreditExhausted", () => {
    it("detects 402 Payment Required", () => {
      expect(anthropicProvider.isCreditExhausted(new Error("Claude API error 402: payment required"))).toBe(true);
    });

    it("detects credit keyword", () => {
      expect(anthropicProvider.isCreditExhausted(new Error("Your credit balance is zero"))).toBe(true);
    });

    it("detects billing keyword", () => {
      expect(anthropicProvider.isCreditExhausted(new Error("billing issue detected"))).toBe(true);
    });

    it("detects insufficient_quota", () => {
      expect(anthropicProvider.isCreditExhausted(new Error("insufficient_quota: account has no credits"))).toBe(true);
    });

    it("does NOT detect regular rate limit (429)", () => {
      expect(anthropicProvider.isCreditExhausted(new Error("Claude API error 429: rate limited"))).toBe(false);
    });

    it("does NOT detect server error (500)", () => {
      expect(anthropicProvider.isCreditExhausted(new Error("Claude API error 500: internal error"))).toBe(false);
    });

    it("does NOT detect timeout", () => {
      expect(anthropicProvider.isCreditExhausted(new Error("request timeout"))).toBe(false);
    });
  });
});
