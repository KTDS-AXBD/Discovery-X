import { describe, it, expect } from "vitest";
import { ACTIVE_STATUSES, ALL_STATUSES, STATUS_CONFIG } from "~/lib/constants/status";

describe("ACTIVE_STATUSES", () => {
  it("contains only valid statuses", () => {
    for (const status of ACTIVE_STATUSES) {
      expect(ALL_STATUSES).toContain(status);
    }
  });

  it("excludes terminal statuses HOLD, DROP, HANDOFF", () => {
    expect(ACTIVE_STATUSES).not.toContain("HOLD");
    expect(ACTIVE_STATUSES).not.toContain("DROP");
    expect(ACTIVE_STATUSES).not.toContain("HANDOFF");
  });

  it("includes all pipeline progression statuses", () => {
    expect(ACTIVE_STATUSES).toContain("DISCOVERY");
    expect(ACTIVE_STATUSES).toContain("IDEA_CARD");
    expect(ACTIVE_STATUSES).toContain("HYPOTHESIS");
    expect(ACTIVE_STATUSES).toContain("EXPERIMENT");
    expect(ACTIVE_STATUSES).toContain("EVIDENCE_REVIEW");
    expect(ACTIVE_STATUSES).toContain("GATE1");
    expect(ACTIVE_STATUSES).toContain("SPRINT");
    expect(ACTIVE_STATUSES).toContain("GATE2");
  });

  it("has 8 active statuses", () => {
    expect(ACTIVE_STATUSES).toHaveLength(8);
  });

  it("all active statuses have config entries", () => {
    for (const status of ACTIVE_STATUSES) {
      expect(STATUS_CONFIG[status]).toBeDefined();
      expect(STATUS_CONFIG[status].label).toBeTruthy();
    }
  });
});
