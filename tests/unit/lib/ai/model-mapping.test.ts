import { describe, it, expect } from "vitest";
import { mapModel } from "~/lib/ai/model-mapping";

describe("mapModel", () => {
  it("maps sonnet 4 to openai gpt-4o", () => {
    expect(mapModel("claude-sonnet-4-20250514", "openai")).toBe("gpt-4o");
  });

  it("maps sonnet 4 to google gemini-2.0-flash", () => {
    expect(mapModel("claude-sonnet-4-20250514", "google")).toBe("gemini-2.0-flash");
  });

  it("maps haiku to openai gpt-4o-mini", () => {
    expect(mapModel("claude-haiku-4-5-20251001", "openai")).toBe("gpt-4o-mini");
  });

  it("maps haiku to google gemini-2.0-flash-lite", () => {
    expect(mapModel("claude-haiku-4-5-20251001", "google")).toBe("gemini-2.0-flash-lite");
  });

  it("maps unknown model to defaults", () => {
    expect(mapModel("claude-unknown-version", "openai")).toBe("gpt-4o");
    expect(mapModel("claude-unknown-version", "google")).toBe("gemini-2.0-flash");
  });

  it("maps to workers-ai model", () => {
    expect(mapModel("claude-sonnet-4-20250514", "workers-ai")).toContain("llama");
  });
});
