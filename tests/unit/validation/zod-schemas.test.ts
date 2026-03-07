import { describe, it, expect } from "vitest";
import {
  CreateDiscoverySchema,
  PromoteToOpenSchema,
  NotNowDecisionSchema,
  DeadEndDecisionSchema,
  NextDecisionSchema,
  ExtensionRequestedSchema,
  CreateExperimentSchema,
  CompleteExperimentSchema,
  CreateEvidenceSchema,
} from "~/features/discovery/validation/discovery-rules";

// ============================================================================
// CreateDiscoverySchema
// ============================================================================

describe("CreateDiscoverySchema", () => {
  const valid = {
    title: "Test Discovery",
    seedSummary: "A valid seed summary",
    sourceType: "article" as const,
  };

  it("accepts valid input", () => {
    expect(CreateDiscoverySchema.parse(valid)).toMatchObject(valid);
  });

  it("accepts all 5 source types", () => {
    for (const st of ["article", "issue", "internal_pain", "meeting_note", "other"]) {
      expect(() => CreateDiscoverySchema.parse({ ...valid, sourceType: st })).not.toThrow();
    }
  });

  it("accepts optional seedLinks", () => {
    const result = CreateDiscoverySchema.parse({
      ...valid,
      seedLinks: ["https://example.com"],
    });
    expect(result.seedLinks).toEqual(["https://example.com"]);
  });

  it("rejects empty title", () => {
    expect(() => CreateDiscoverySchema.parse({ ...valid, title: "" })).toThrow();
  });

  it("rejects title >80 chars", () => {
    expect(() => CreateDiscoverySchema.parse({ ...valid, title: "a".repeat(81) })).toThrow();
  });

  it("rejects empty seedSummary", () => {
    expect(() => CreateDiscoverySchema.parse({ ...valid, seedSummary: "" })).toThrow();
  });

  it("rejects seedSummary >400 chars", () => {
    expect(() => CreateDiscoverySchema.parse({ ...valid, seedSummary: "a".repeat(401) })).toThrow();
  });

  it("rejects invalid sourceType", () => {
    expect(() => CreateDiscoverySchema.parse({ ...valid, sourceType: "invalid" })).toThrow();
  });

  it("rejects invalid seedLinks URL", () => {
    expect(() =>
      CreateDiscoverySchema.parse({ ...valid, seedLinks: ["not-a-url"] })
    ).toThrow();
  });
});

// ============================================================================
// PromoteToOpenSchema
// ============================================================================

describe("PromoteToOpenSchema", () => {
  const valid = {
    ownerId: "user-1",
    firstExperiment: {
      hypothesis: "Test hypothesis",
      minimalAction: "Test action",
      deadline: new Date("2026-02-01"),
      expectedEvidence: "Expected evidence",
    },
  };

  it("accepts valid input", () => {
    expect(PromoteToOpenSchema.parse(valid)).toMatchObject({
      ownerId: "user-1",
    });
  });

  it("rejects empty ownerId", () => {
    expect(() => PromoteToOpenSchema.parse({ ...valid, ownerId: "" })).toThrow();
  });

  it("rejects empty hypothesis", () => {
    expect(() =>
      PromoteToOpenSchema.parse({
        ...valid,
        firstExperiment: { ...valid.firstExperiment, hypothesis: "" },
      })
    ).toThrow();
  });

  it("rejects hypothesis >200 chars", () => {
    expect(() =>
      PromoteToOpenSchema.parse({
        ...valid,
        firstExperiment: { ...valid.firstExperiment, hypothesis: "a".repeat(201) },
      })
    ).toThrow();
  });

  it("rejects empty minimalAction", () => {
    expect(() =>
      PromoteToOpenSchema.parse({
        ...valid,
        firstExperiment: { ...valid.firstExperiment, minimalAction: "" },
      })
    ).toThrow();
  });

  it("rejects empty expectedEvidence", () => {
    expect(() =>
      PromoteToOpenSchema.parse({
        ...valid,
        firstExperiment: { ...valid.firstExperiment, expectedEvidence: "" },
      })
    ).toThrow();
  });
});

// ============================================================================
// NotNowDecisionSchema
// ============================================================================

describe("NotNowDecisionSchema", () => {
  const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const valid = {
    decisionRationale: "Valid rationale",
    notNowTriggerType: "Technology_Maturity" as const,
    notNowTriggerCondition: "When tech matures",
    revisitDate: futureDate,
  };

  it("accepts valid input", () => {
    expect(NotNowDecisionSchema.parse(valid)).toMatchObject({
      notNowTriggerType: "Technology_Maturity",
    });
  });

  it("accepts all 4 trigger types", () => {
    for (const tt of [
      "Technology_Maturity",
      "Policy_Regulation",
      "Customer_Behavior",
      "Internal_Capability",
    ]) {
      expect(() =>
        NotNowDecisionSchema.parse({ ...valid, notNowTriggerType: tt })
      ).not.toThrow();
    }
  });

  it("rejects past revisitDate", () => {
    expect(() =>
      NotNowDecisionSchema.parse({ ...valid, revisitDate: new Date("2020-01-01") })
    ).toThrow();
  });

  it("rejects missing decisionRationale", () => {
    const { decisionRationale: _, ...rest } = valid;
    expect(() => NotNowDecisionSchema.parse(rest)).toThrow();
  });

  it("rejects empty triggerCondition", () => {
    expect(() =>
      NotNowDecisionSchema.parse({ ...valid, notNowTriggerCondition: "" })
    ).toThrow();
  });

  it("rejects invalid triggerType", () => {
    expect(() =>
      NotNowDecisionSchema.parse({ ...valid, notNowTriggerType: "Invalid" })
    ).toThrow();
  });
});

// ============================================================================
// DeadEndDecisionSchema
// ============================================================================

describe("DeadEndDecisionSchema", () => {
  const valid = {
    decisionRationale: "Valid rationale",
    deadEndFailurePattern: ["assumption_invalidated"],
    deadEndEvidenceReason: "Evidence shows failure",
  };

  it("accepts valid input with 1 pattern", () => {
    expect(DeadEndDecisionSchema.parse(valid)).toMatchObject(valid);
  });

  it("accepts 3 patterns", () => {
    expect(() =>
      DeadEndDecisionSchema.parse({
        ...valid,
        deadEndFailurePattern: ["a", "b", "c"],
      })
    ).not.toThrow();
  });

  it("rejects empty pattern array", () => {
    expect(() =>
      DeadEndDecisionSchema.parse({ ...valid, deadEndFailurePattern: [] })
    ).toThrow();
  });

  it("rejects 4 patterns", () => {
    expect(() =>
      DeadEndDecisionSchema.parse({
        ...valid,
        deadEndFailurePattern: ["a", "b", "c", "d"],
      })
    ).toThrow();
  });

  it("rejects empty evidenceReason", () => {
    expect(() =>
      DeadEndDecisionSchema.parse({ ...valid, deadEndEvidenceReason: "" })
    ).toThrow();
  });

  it("rejects evidenceReason >200 chars", () => {
    expect(() =>
      DeadEndDecisionSchema.parse({
        ...valid,
        deadEndEvidenceReason: "a".repeat(201),
      })
    ).toThrow();
  });
});

// ============================================================================
// NextDecisionSchema
// ============================================================================

describe("NextDecisionSchema", () => {
  it("accepts valid rationale", () => {
    expect(NextDecisionSchema.parse({ decisionRationale: "Good reason" })).toMatchObject({
      decisionRationale: "Good reason",
    });
  });

  it("rejects empty rationale", () => {
    expect(() => NextDecisionSchema.parse({ decisionRationale: "" })).toThrow();
  });

  it("rejects rationale >400 chars", () => {
    expect(() =>
      NextDecisionSchema.parse({ decisionRationale: "a".repeat(401) })
    ).toThrow();
  });
});

// ============================================================================
// ExtensionRequestedSchema
// ============================================================================

describe("ExtensionRequestedSchema", () => {
  it("accepts valid rationale", () => {
    expect(
      ExtensionRequestedSchema.parse({ extensionRationale: "Need more time" })
    ).toMatchObject({ extensionRationale: "Need more time" });
  });

  it("rejects empty rationale", () => {
    expect(() =>
      ExtensionRequestedSchema.parse({ extensionRationale: "" })
    ).toThrow();
  });

  it("rejects rationale >400 chars", () => {
    expect(() =>
      ExtensionRequestedSchema.parse({ extensionRationale: "a".repeat(401) })
    ).toThrow();
  });
});

// ============================================================================
// CreateExperimentSchema
// ============================================================================

describe("CreateExperimentSchema", () => {
  const valid = {
    hypothesis: "Test hypothesis",
    minimalAction: "Test action",
    deadline: new Date("2026-02-01"),
    expectedEvidence: "Expected result",
  };

  it("accepts valid input", () => {
    expect(CreateExperimentSchema.parse(valid)).toMatchObject({
      hypothesis: "Test hypothesis",
    });
  });

  it("rejects empty hypothesis", () => {
    expect(() => CreateExperimentSchema.parse({ ...valid, hypothesis: "" })).toThrow();
  });

  it("rejects hypothesis >200 chars", () => {
    expect(() =>
      CreateExperimentSchema.parse({ ...valid, hypothesis: "a".repeat(201) })
    ).toThrow();
  });

  it("rejects empty minimalAction", () => {
    expect(() =>
      CreateExperimentSchema.parse({ ...valid, minimalAction: "" })
    ).toThrow();
  });

  it("rejects empty expectedEvidence", () => {
    expect(() =>
      CreateExperimentSchema.parse({ ...valid, expectedEvidence: "" })
    ).toThrow();
  });
});

// ============================================================================
// CompleteExperimentSchema
// ============================================================================

describe("CompleteExperimentSchema", () => {
  it("accepts valid resultSummary", () => {
    expect(
      CompleteExperimentSchema.parse({ resultSummary: "Experiment completed" })
    ).toMatchObject({ resultSummary: "Experiment completed" });
  });

  it("rejects empty resultSummary", () => {
    expect(() => CompleteExperimentSchema.parse({ resultSummary: "" })).toThrow();
  });

  it("rejects resultSummary >400 chars", () => {
    expect(() =>
      CompleteExperimentSchema.parse({ resultSummary: "a".repeat(401) })
    ).toThrow();
  });
});

// ============================================================================
// CreateEvidenceSchema
// ============================================================================

describe("CreateEvidenceSchema", () => {
  const valid = {
    type: "DATA" as const,
    strength: "A" as const,
    content: "Evidence content",
  };

  it("accepts valid input", () => {
    expect(CreateEvidenceSchema.parse(valid)).toMatchObject(valid);
  });

  it("accepts all 5 evidence types", () => {
    for (const t of ["DATA", "USER", "ARTIFACT", "REF", "ASSUMPTION"]) {
      expect(() => CreateEvidenceSchema.parse({ ...valid, type: t })).not.toThrow();
    }
  });

  it("accepts all 4 strength levels", () => {
    for (const s of ["A", "B", "C", "D"]) {
      expect(() => CreateEvidenceSchema.parse({ ...valid, strength: s })).not.toThrow();
    }
  });

  it("rejects invalid type", () => {
    expect(() => CreateEvidenceSchema.parse({ ...valid, type: "INVALID" })).toThrow();
  });

  it("rejects invalid strength", () => {
    expect(() => CreateEvidenceSchema.parse({ ...valid, strength: "E" })).toThrow();
  });

  it("rejects empty content", () => {
    expect(() => CreateEvidenceSchema.parse({ ...valid, content: "" })).toThrow();
  });

  it("accepts optional linkOrAttachment", () => {
    expect(() =>
      CreateEvidenceSchema.parse({ ...valid, linkOrAttachment: "https://example.com" })
    ).not.toThrow();
  });

  it("rejects invalid URL for linkOrAttachment", () => {
    expect(() =>
      CreateEvidenceSchema.parse({ ...valid, linkOrAttachment: "not-a-url" })
    ).toThrow();
  });

  it("accepts optional experimentId", () => {
    expect(() =>
      CreateEvidenceSchema.parse({ ...valid, experimentId: "exp-1" })
    ).not.toThrow();
  });
});
