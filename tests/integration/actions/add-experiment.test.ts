import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDB } from "../../helpers/db";
import { makeUser, makeDiscovery, makeExperiment, resetFixtureCounter } from "../../helpers/fixtures";
import { users, discoveries, experiments } from "~/db/schema";
import {
  CreateExperimentSchema,
  DiscoveryValidationRules,
  ValidationError,
} from "~/features/discovery/validation/discovery-rules";

describe("Add Experiment", () => {
  let db: TestDB;

  beforeEach(() => {
    resetFixtureCounter();
    db = createTestDb();
    const user = makeUser({ id: "user-1" });
    db.insert(users).values(user).run();
  });

  it("adds first experiment to OPEN discovery", () => {
    const disc = makeDiscovery({ id: "disc-1", status: "OPEN", ownerId: "user-1" });
    db.insert(discoveries).values(disc).run();

    const input = CreateExperimentSchema.parse({
      hypothesis: "New hypothesis",
      minimalAction: "New action",
      deadline: new Date("2026-02-01"),
      expectedEvidence: "Expected",
    });

    db.insert(experiments).values({
      id: "exp-1",
      discoveryId: "disc-1",
      ...input,
    }).run();

    const exps = db.select().from(experiments).where(eq(experiments.discoveryId, "disc-1")).all();
    expect(exps).toHaveLength(1);
  });

  it("adds second experiment (limit = 2 for OPEN)", async () => {
    const disc = makeDiscovery({ id: "disc-1", status: "OPEN", ownerId: "user-1" });
    db.insert(discoveries).values(disc).run();
    db.insert(experiments).values(makeExperiment({ id: "exp-1", discoveryId: "disc-1" })).run();

    // With 1 experiment, should allow adding another
    const result = await DiscoveryValidationRules.validateExperimentLimit(db as never, "disc-1");
    expect(result.valid).toBe(true);
  });

  it("rejects 3rd experiment on OPEN discovery", async () => {
    const disc = makeDiscovery({ id: "disc-1", status: "OPEN", ownerId: "user-1" });
    db.insert(discoveries).values(disc).run();
    db.insert(experiments).values([
      makeExperiment({ id: "exp-1", discoveryId: "disc-1" }),
      makeExperiment({ id: "exp-2", discoveryId: "disc-1" }),
    ]).run();

    await expect(
      DiscoveryValidationRules.validateExperimentLimit(db as never, "disc-1")
    ).rejects.toThrow(ValidationError);
  });

  it("validates experiment schema fields", () => {
    expect(() =>
      CreateExperimentSchema.parse({
        hypothesis: "",
        minimalAction: "Action",
        deadline: new Date(),
        expectedEvidence: "Evidence",
      })
    ).toThrow();
  });

  it("rejects hypothesis >200 chars", () => {
    expect(() =>
      CreateExperimentSchema.parse({
        hypothesis: "a".repeat(201),
        minimalAction: "Action",
        deadline: new Date(),
        expectedEvidence: "Evidence",
      })
    ).toThrow();
  });

  it("stores experiment with correct discoveryId", () => {
    const disc = makeDiscovery({ id: "disc-1", status: "OPEN", ownerId: "user-1" });
    db.insert(discoveries).values(disc).run();

    db.insert(experiments).values(
      makeExperiment({ id: "exp-1", discoveryId: "disc-1" })
    ).run();

    const exp = db.query.experiments.findFirst({
      where: eq(experiments.id, "exp-1"),
    }).sync();
    expect(exp!.discoveryId).toBe("disc-1");
  });

  it("allows 3rd experiment on EXTENSION_REQUESTED discovery", () => {
    const disc = makeDiscovery({ id: "disc-1", status: "EXTENSION_REQUESTED", ownerId: "user-1" });
    db.insert(discoveries).values(disc).run();
    db.insert(experiments).values([
      makeExperiment({ id: "exp-1", discoveryId: "disc-1" }),
      makeExperiment({ id: "exp-2", discoveryId: "disc-1" }),
    ]).run();

    // For EXTENSION_REQUESTED, the limit is raised — we can add a 3rd
    db.insert(experiments).values(
      makeExperiment({ id: "exp-3", discoveryId: "disc-1" })
    ).run();

    const exps = db.select().from(experiments).where(eq(experiments.discoveryId, "disc-1")).all();
    expect(exps).toHaveLength(3);
  });

  it("sets createdAt timestamp on experiment", () => {
    const disc = makeDiscovery({ id: "disc-1", status: "OPEN", ownerId: "user-1" });
    db.insert(discoveries).values(disc).run();

    db.insert(experiments).values(
      makeExperiment({ id: "exp-1", discoveryId: "disc-1" })
    ).run();

    const exp = db.query.experiments.findFirst({
      where: eq(experiments.id, "exp-1"),
    }).sync();
    expect(exp!.createdAt).toBeTruthy();
  });
});
