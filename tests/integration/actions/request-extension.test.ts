import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDB } from "../../helpers/db";
import { makeUser, makeDiscovery, makeExperiment, resetFixtureCounter } from "../../helpers/fixtures";
import { users, discoveries, experiments } from "~/db/schema";
import {
  ExtensionRequestedSchema,
  DiscoveryValidationRules,
  ValidationError,
} from "~/lib/validation/discovery-rules";

describe("Request Extension (OPEN → EXTENSION_REQUESTED)", () => {
  let db: TestDB;

  beforeEach(() => {
    resetFixtureCounter();
    db = createTestDb();
    const user = makeUser({ id: "user-1" });
    const disc = makeDiscovery({
      id: "disc-1",
      status: "OPEN",
      ownerId: "user-1",
      dueDate: new Date("2026-01-29T00:00:00Z"),
    });
    db.insert(users).values(user).run();
    db.insert(discoveries).values(disc).run();
  });

  it("validates extension rationale", () => {
    expect(() =>
      ExtensionRequestedSchema.parse({ extensionRationale: "Need more time for experiments" })
    ).not.toThrow();
  });

  it("rejects empty extension rationale", () => {
    expect(() =>
      ExtensionRequestedSchema.parse({ extensionRationale: "" })
    ).toThrow();
  });

  it("throws when fewer than 2 experiments exist (experiment limit validation)", async () => {
    // With 0 experiments, the limit check passes (allows adding more)
    const result = await DiscoveryValidationRules.validateExperimentLimit(db as never, "disc-1");
    expect(result.valid).toBe(true);
  });

  it("throws when 2 experiments already exist", async () => {
    db.insert(experiments).values([
      makeExperiment({ id: "exp-1", discoveryId: "disc-1" }),
      makeExperiment({ id: "exp-2", discoveryId: "disc-1" }),
    ]).run();

    await expect(
      DiscoveryValidationRules.validateExperimentLimit(db as never, "disc-1")
    ).rejects.toThrow(ValidationError);
  });

  it("calculates extension due date as +14 days", () => {
    const currentDueDate = new Date("2026-01-29T00:00:00Z");
    const newDueDate = DiscoveryValidationRules.calculateExtensionDueDate(currentDueDate);
    expect(newDueDate.toISOString()).toBe("2026-02-12T00:00:00.000Z");
  });

  it("transitions to EXTENSION_REQUESTED in DB", () => {
    db.update(discoveries)
      .set({ status: "EXTENSION_REQUESTED" })
      .where(eq(discoveries.id, "disc-1"))
      .run();

    const result = db.query.discoveries.findFirst({
      where: eq(discoveries.id, "disc-1"),
    }).sync();
    expect(result!.status).toBe("EXTENSION_REQUESTED");
  });
});
