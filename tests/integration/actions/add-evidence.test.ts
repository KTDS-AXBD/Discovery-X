import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDB } from "../../helpers/db";
import { makeUser, makeDiscovery, makeExperiment, makeEvidence, resetFixtureCounter } from "../../helpers/fixtures";
import { users, discoveries, experiments, evidence } from "~/db/schema";
import { CreateEvidenceSchema } from "~/features/discovery/validation/discovery-rules";

describe("Add Evidence", () => {
  let db: TestDB;

  beforeEach(() => {
    resetFixtureCounter();
    db = createTestDb();
    const user = makeUser({ id: "user-1" });
    const disc = makeDiscovery({ id: "disc-1", status: "OPEN", ownerId: "user-1" });
    db.insert(users).values(user).run();
    db.insert(discoveries).values(disc).run();
  });

  it("adds evidence to discovery", () => {
    db.insert(evidence).values(
      makeEvidence({ id: "ev-1", discoveryId: "disc-1", createdById: "user-1" })
    ).run();

    const evs = db.select().from(evidence).where(eq(evidence.discoveryId, "disc-1")).all();
    expect(evs).toHaveLength(1);
  });

  it("validates evidence type enum", () => {
    for (const type of ["DATA", "USER", "ARTIFACT", "REF", "ASSUMPTION"]) {
      expect(() =>
        CreateEvidenceSchema.parse({ type, strength: "A", content: "Test" })
      ).not.toThrow();
    }
  });

  it("validates evidence strength enum", () => {
    for (const strength of ["A", "B", "C", "D"]) {
      expect(() =>
        CreateEvidenceSchema.parse({ type: "DATA", strength, content: "Test" })
      ).not.toThrow();
    }
  });

  it("links evidence to experiment optionally", () => {
    db.insert(experiments).values(
      makeExperiment({ id: "exp-1", discoveryId: "disc-1" })
    ).run();

    db.insert(evidence).values(
      makeEvidence({
        id: "ev-1",
        discoveryId: "disc-1",
        createdById: "user-1",
        experimentId: "exp-1",
      })
    ).run();

    const ev = db.query.evidence.findFirst({
      where: eq(evidence.id, "ev-1"),
    }).sync();
    expect(ev!.experimentId).toBe("exp-1");
  });

  it("stores evidence without experimentId", () => {
    db.insert(evidence).values(
      makeEvidence({ id: "ev-1", discoveryId: "disc-1", createdById: "user-1" })
    ).run();

    const ev = db.query.evidence.findFirst({
      where: eq(evidence.id, "ev-1"),
    }).sync();
    expect(ev!.experimentId).toBeNull();
  });
});
