import { describe, it, expect } from "vitest";
import {
  DiscoveryValidationRules,
  ValidationError,
} from "~/features/discovery/validation/discovery-rules";

// ============================================================================
// validateOwnerRequired
// ============================================================================

describe("validateOwnerRequired", () => {
  it("passes with valid ownerId", () => {
    expect(() => DiscoveryValidationRules.validateOwnerRequired("user-1")).not.toThrow();
  });

  it("throws on null", () => {
    expect(() => DiscoveryValidationRules.validateOwnerRequired(null)).toThrow(
      ValidationError
    );
  });

  it("throws on undefined", () => {
    expect(() => DiscoveryValidationRules.validateOwnerRequired(undefined)).toThrow(
      ValidationError
    );
  });

  it("throws on empty string", () => {
    expect(() => DiscoveryValidationRules.validateOwnerRequired("")).toThrow(
      ValidationError
    );
  });
});

// ============================================================================
// validateNotNowDecision
// ============================================================================

describe("validateNotNowDecision", () => {
  const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  it("passes with all required fields", () => {
    expect(() =>
      DiscoveryValidationRules.validateNotNowDecision({
        notNowTriggerType: "Technology_Maturity",
        notNowTriggerCondition: "When ready",
        revisitDate: futureDate,
      })
    ).not.toThrow();
  });

  it("throws when all fields missing", () => {
    expect(() =>
      DiscoveryValidationRules.validateNotNowDecision({})
    ).toThrow(ValidationError);
  });

  it("throws when triggerType missing", () => {
    expect(() =>
      DiscoveryValidationRules.validateNotNowDecision({
        notNowTriggerCondition: "Condition",
        revisitDate: futureDate,
      })
    ).toThrow(ValidationError);
  });

  it("throws when triggerCondition missing", () => {
    expect(() =>
      DiscoveryValidationRules.validateNotNowDecision({
        notNowTriggerType: "Technology_Maturity",
        revisitDate: futureDate,
      })
    ).toThrow(ValidationError);
  });

  it("throws when revisitDate missing", () => {
    expect(() =>
      DiscoveryValidationRules.validateNotNowDecision({
        notNowTriggerType: "Technology_Maturity",
        notNowTriggerCondition: "Condition",
      })
    ).toThrow(ValidationError);
  });

  it("throws when revisitDate is in the past", () => {
    expect(() =>
      DiscoveryValidationRules.validateNotNowDecision({
        notNowTriggerType: "Technology_Maturity",
        notNowTriggerCondition: "Condition",
        revisitDate: new Date("2020-01-01"),
      })
    ).toThrow(ValidationError);
  });
});

// ============================================================================
// validateDeadEndDecision
// ============================================================================

describe("validateDeadEndDecision", () => {
  it("passes with 1 pattern and evidenceReason", () => {
    expect(() =>
      DiscoveryValidationRules.validateDeadEndDecision({
        deadEndFailurePattern: ["assumption_invalidated"],
        deadEndEvidenceReason: "Clear reason",
      })
    ).not.toThrow();
  });

  it("passes with 3 patterns", () => {
    expect(() =>
      DiscoveryValidationRules.validateDeadEndDecision({
        deadEndFailurePattern: ["a", "b", "c"],
        deadEndEvidenceReason: "Reason",
      })
    ).not.toThrow();
  });

  it("throws on empty pattern array", () => {
    expect(() =>
      DiscoveryValidationRules.validateDeadEndDecision({
        deadEndFailurePattern: [],
        deadEndEvidenceReason: "Reason",
      })
    ).toThrow(ValidationError);
  });

  it("throws on 4 patterns", () => {
    expect(() =>
      DiscoveryValidationRules.validateDeadEndDecision({
        deadEndFailurePattern: ["a", "b", "c", "d"],
        deadEndEvidenceReason: "Reason",
      })
    ).toThrow(ValidationError);
  });

  it("throws on null pattern array", () => {
    expect(() =>
      DiscoveryValidationRules.validateDeadEndDecision({
        deadEndFailurePattern: null,
        deadEndEvidenceReason: "Reason",
      })
    ).toThrow(ValidationError);
  });

  it("throws on empty evidenceReason", () => {
    expect(() =>
      DiscoveryValidationRules.validateDeadEndDecision({
        deadEndFailurePattern: ["a"],
        deadEndEvidenceReason: "",
      })
    ).toThrow(ValidationError);
  });

  it("throws on whitespace-only evidenceReason", () => {
    expect(() =>
      DiscoveryValidationRules.validateDeadEndDecision({
        deadEndFailurePattern: ["a"],
        deadEndEvidenceReason: "   ",
      })
    ).toThrow(ValidationError);
  });
});

// ============================================================================
// calculateDueDate
// ============================================================================

describe("calculateDueDate", () => {
  it("returns createdAt + 28 days", () => {
    const result = DiscoveryValidationRules.calculateDueDate(
      new Date("2026-01-01T00:00:00Z")
    );
    expect(result.toISOString()).toBe("2026-01-29T00:00:00.000Z");
  });

  it("handles month boundary correctly", () => {
    const result = DiscoveryValidationRules.calculateDueDate(
      new Date("2026-01-15T00:00:00Z")
    );
    expect(result.toISOString()).toBe("2026-02-12T00:00:00.000Z");
  });
});

// ============================================================================
// calculateExtensionDueDate
// ============================================================================

describe("calculateExtensionDueDate", () => {
  it("returns currentDueDate + 14 days", () => {
    const result = DiscoveryValidationRules.calculateExtensionDueDate(
      new Date("2026-01-29T00:00:00Z")
    );
    expect(result.toISOString()).toBe("2026-02-12T00:00:00.000Z");
  });

  it("handles month boundary correctly", () => {
    const result = DiscoveryValidationRules.calculateExtensionDueDate(
      new Date("2026-02-20T00:00:00Z")
    );
    expect(result.toISOString()).toBe("2026-03-06T00:00:00.000Z");
  });
});
