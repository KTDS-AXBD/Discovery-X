import { describe, it, expect } from "vitest";
import { googleProvider } from "~/lib/ai/providers/google";

describe("googleProvider", () => {
  it("has correct id and capabilities", () => {
    expect(googleProvider.id).toBe("google");
    expect(googleProvider.capabilities.supportsTools).toBe(true);
    expect(googleProvider.capabilities.supportsStreaming).toBe(true);
  });

  describe("isCreditExhausted", () => {
    it("detects RESOURCE_EXHAUSTED + quota", () => {
      expect(googleProvider.isCreditExhausted(new Error("429 resource_exhausted quota exceeded"))).toBe(true);
    });

    it("detects billing keyword with 403", () => {
      expect(googleProvider.isCreditExhausted(new Error("403: billing disabled for this project"))).toBe(true);
    });

    it("does NOT detect regular 429", () => {
      expect(googleProvider.isCreditExhausted(new Error("Google AI API error 429: rate limited"))).toBe(false);
    });

    it("does NOT detect server errors", () => {
      expect(googleProvider.isCreditExhausted(new Error("Google AI API error 500: internal"))).toBe(false);
    });
  });
});
