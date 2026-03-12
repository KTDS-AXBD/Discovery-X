import { describe, it, expect } from "vitest";
import { mapModel } from "~/lib/ai/model-mapping";

describe("mapModel", () => {
  it("maps sonnet 4 to openai gpt-4.1", () => {
    expect(mapModel("claude-sonnet-4-20250514", "openai")).toBe("gpt-4.1");
  });

  it("maps sonnet 4 to google gemini-2.5-pro", () => {
    expect(mapModel("claude-sonnet-4-20250514", "google")).toBe("gemini-2.5-pro");
  });

  it("maps haiku to openai gpt-4.1-nano", () => {
    expect(mapModel("claude-haiku-4-5-20251001", "openai")).toBe("gpt-4.1-nano");
  });

  it("maps haiku to google gemini-2.5-flash", () => {
    expect(mapModel("claude-haiku-4-5-20251001", "google")).toBe("gemini-2.5-flash");
  });

  it("maps opus to openai gpt-5.4", () => {
    expect(mapModel("claude-opus-4-20250514", "openai")).toBe("gpt-5.4");
  });

  it("maps unknown model to defaults", () => {
    expect(mapModel("claude-unknown-version", "openai")).toBe("gpt-4.1");
    expect(mapModel("claude-unknown-version", "google")).toBe("gemini-2.5-pro");
  });

  it("maps to deepseek model", () => {
    expect(mapModel("claude-sonnet-4-20250514", "deepseek")).toBe("deepseek-chat");
    expect(mapModel("claude-opus-4-20250514", "deepseek")).toBe("deepseek-reasoner");
  });

  it("maps to workers-ai model", () => {
    expect(mapModel("claude-sonnet-4-20250514", "workers-ai")).toContain("llama");
  });
});
