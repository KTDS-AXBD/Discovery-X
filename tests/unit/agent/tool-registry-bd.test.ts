import { describe, it, expect } from "vitest";
import { getToolsForAutonomyLevel, TOOL_MIN_AUTONOMY } from "~/features/chat/agent/tool-registry";

const ALL_TOOLS = getToolsForAutonomyLevel(3);

describe("BD PoC tool-registry", () => {
  // U-01
  it("registers generate_idea_candidates with correct schema", () => {
    const tool = ALL_TOOLS.find((t) => t.name === "generate_idea_candidates");
    expect(tool).toBeDefined();
    expect(tool!.input_schema.required).toContain("count");
    expect(tool!.input_schema.properties).toHaveProperty("count");
    expect(tool!.input_schema.properties).toHaveProperty("sourceContext");
    expect(tool!.input_schema.properties).toHaveProperty("industryCode");
    expect(TOOL_MIN_AUTONOMY.generate_idea_candidates).toBe(2);
  });

  // U-02
  it("registers select_idea_candidate with correct schema", () => {
    const tool = ALL_TOOLS.find((t) => t.name === "select_idea_candidate");
    expect(tool).toBeDefined();
    expect(tool!.input_schema.required).toContain("candidateGroupId");
    expect(tool!.input_schema.required).toContain("selectedDiscoveryId");
    expect(tool!.input_schema.properties).toHaveProperty("reason");
    expect(TOOL_MIN_AUTONOMY.select_idea_candidate).toBe(2);
  });

  // U-03
  it("registers auto_fill_template with correct schema", () => {
    const tool = ALL_TOOLS.find((t) => t.name === "auto_fill_template");
    expect(tool).toBeDefined();
    expect(tool!.input_schema.required).toContain("discoveryId");
    expect(tool!.input_schema.properties).toHaveProperty("hypothesis");
    expect(tool!.input_schema.properties).toHaveProperty("targetSegment");
    expect(tool!.input_schema.properties).toHaveProperty("valueProposition");
    expect(TOOL_MIN_AUTONOMY.auto_fill_template).toBe(2);
  });
});
