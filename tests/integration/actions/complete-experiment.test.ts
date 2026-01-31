import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDB } from "../../helpers/db";
import { makeUser, makeDiscovery, makeExperiment, resetFixtureCounter } from "../../helpers/fixtures";
import { users, discoveries, experiments } from "~/db/schema";
import { CompleteExperimentSchema } from "~/lib/validation/discovery-rules";

describe("Complete Experiment", () => {
  let db: TestDB;

  beforeEach(() => {
    resetFixtureCounter();
    db = createTestDb();
    const user = makeUser({ id: "user-1" });
    const disc = makeDiscovery({ id: "disc-1", status: "OPEN", ownerId: "user-1" });
    db.insert(users).values(user).run();
    db.insert(discoveries).values(disc).run();
    db.insert(experiments).values(
      makeExperiment({ id: "exp-1", discoveryId: "disc-1" })
    ).run();
  });

  it("sets resultSummary on experiment", () => {
    const input = CompleteExperimentSchema.parse({ resultSummary: "Hypothesis confirmed" });

    db.update(experiments)
      .set({ resultSummary: input.resultSummary, completedAt: new Date() })
      .where(eq(experiments.id, "exp-1"))
      .run();

    const exp = db.query.experiments.findFirst({
      where: eq(experiments.id, "exp-1"),
    }).sync();
    expect(exp!.resultSummary).toBe("Hypothesis confirmed");
  });

  it("sets completedAt timestamp", () => {
    const now = new Date();
    db.update(experiments)
      .set({ resultSummary: "Done", completedAt: now })
      .where(eq(experiments.id, "exp-1"))
      .run();

    const exp = db.query.experiments.findFirst({
      where: eq(experiments.id, "exp-1"),
    }).sync();
    expect(exp!.completedAt).toBeTruthy();
  });

  it("rejects empty resultSummary", () => {
    expect(() => CompleteExperimentSchema.parse({ resultSummary: "" })).toThrow();
  });
});
