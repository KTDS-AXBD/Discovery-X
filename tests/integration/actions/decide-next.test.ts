import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDB } from "../../helpers/db";
import { makeUser, makeDiscovery, makeEvidence, resetFixtureCounter } from "../../helpers/fixtures";
import { users, discoveries, evidence, eventLogs } from "~/db/schema";
import {
  NextDecisionSchema,
  DiscoveryValidationRules,
} from "~/features/discovery/validation/discovery-rules";

describe("Decide OPEN → NEXT", () => {
  let db: TestDB;

  beforeEach(() => {
    resetFixtureCounter();
    db = createTestDb();
    const user = makeUser({ id: "user-1" });
    const disc = makeDiscovery({ id: "disc-1", status: "OPEN", ownerId: "user-1" });
    db.insert(users).values(user).run();
    db.insert(discoveries).values(disc).run();
  });

  it("transitions OPEN → NEXT", () => {
    NextDecisionSchema.parse({ decisionRationale: "Strong evidence" });

    db.update(discoveries)
      .set({
        status: "NEXT",
        decisionState: "NEXT",
        decisionRationale: "Strong evidence",
        decidedAt: new Date(),
      })
      .where(eq(discoveries.id, "disc-1"))
      .run();

    const result = db.query.discoveries.findFirst({
      where: eq(discoveries.id, "disc-1"),
    }).sync();
    expect(result!.status).toBe("NEXT");
    expect(result!.decisionRationale).toBe("Strong evidence");
  });

  it("warns when A/B evidence < 2", async () => {
    db.insert(evidence).values(
      makeEvidence({ discoveryId: "disc-1", createdById: "user-1", strength: "A" })
    ).run();

    const result = await DiscoveryValidationRules.validateNextDecision(db as never, "disc-1");
    expect(result.valid).toBe(true);
    expect(result.warning).toBeTruthy();
  });

  it("no warning when A/B evidence >= 2", async () => {
    db.insert(evidence).values([
      makeEvidence({ id: "ev-1", discoveryId: "disc-1", createdById: "user-1", strength: "A" }),
      makeEvidence({ id: "ev-2", discoveryId: "disc-1", createdById: "user-1", strength: "B" }),
    ]).run();

    const result = await DiscoveryValidationRules.validateNextDecision(db as never, "disc-1");
    expect(result.valid).toBe(true);
    expect(result.warning).toBeUndefined();
  });

  it("records event log", () => {
    db.insert(eventLogs).values({
      id: "evt-1",
      actorId: "user-1",
      discoveryId: "disc-1",
      eventType: "STATUS_CHANGE",
      metadata: { from: "OPEN", to: "NEXT" },
    }).run();

    const logs = db.select().from(eventLogs).where(eq(eventLogs.discoveryId, "disc-1")).all();
    expect(logs).toHaveLength(1);
  });

  it("sets decidedAt timestamp", () => {
    const now = new Date();
    db.update(discoveries)
      .set({ status: "NEXT", decidedAt: now })
      .where(eq(discoveries.id, "disc-1"))
      .run();

    const result = db.query.discoveries.findFirst({
      where: eq(discoveries.id, "disc-1"),
    }).sync();
    expect(result!.decidedAt).toBeTruthy();
  });
});
