import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDB } from "../../helpers/db";
import { makeUser, makeDiscovery, resetFixtureCounter } from "../../helpers/fixtures";
import { users, discoveries, eventLogs } from "~/db";
import {
  DeadEndDecisionSchema,
  DiscoveryValidationRules,
  ValidationError,
} from "~/features/discovery/validation/discovery-rules";

describe("Decide OPEN → DEAD_END", () => {
  let db: TestDB;

  beforeEach(() => {
    resetFixtureCounter();
    db = createTestDb();
    const user = makeUser({ id: "user-1" });
    const disc = makeDiscovery({ id: "disc-1", status: "OPEN", ownerId: "user-1" });
    db.insert(users).values(user).run();
    db.insert(discoveries).values(disc).run();
  });

  it("transitions OPEN → DEAD_END with failure patterns", () => {
    const input = DeadEndDecisionSchema.parse({
      decisionRationale: "No demand",
      deadEndFailurePattern: ["no_user_demand"],
      deadEndEvidenceReason: "User interviews showed no interest",
    });

    db.update(discoveries)
      .set({
        status: "DEAD_END",
        decisionState: "DEAD_END",
        decisionRationale: input.decisionRationale,
        deadEndFailurePattern: input.deadEndFailurePattern,
        deadEndEvidenceReason: input.deadEndEvidenceReason,
        decidedAt: new Date(),
      })
      .where(eq(discoveries.id, "disc-1"))
      .run();

    const result = db.query.discoveries.findFirst({
      where: eq(discoveries.id, "disc-1"),
    }).sync();
    expect(result!.status).toBe("DEAD_END");
    expect(result!.deadEndFailurePattern).toEqual(["no_user_demand"]);
    expect(result!.deadEndEvidenceReason).toBe("User interviews showed no interest");
  });

  it("accepts 1-3 failure patterns", () => {
    for (const patterns of [["a"], ["a", "b"], ["a", "b", "c"]]) {
      expect(() =>
        DiscoveryValidationRules.validateDeadEndDecision({
          deadEndFailurePattern: patterns,
          deadEndEvidenceReason: "Reason",
        })
      ).not.toThrow();
    }
  });

  it("rejects 0 failure patterns via business rule", () => {
    expect(() =>
      DiscoveryValidationRules.validateDeadEndDecision({
        deadEndFailurePattern: [],
        deadEndEvidenceReason: "Reason",
      })
    ).toThrow(ValidationError);
  });

  it("rejects 4 failure patterns via business rule", () => {
    expect(() =>
      DiscoveryValidationRules.validateDeadEndDecision({
        deadEndFailurePattern: ["a", "b", "c", "d"],
        deadEndEvidenceReason: "Reason",
      })
    ).toThrow(ValidationError);
  });

  it("requires evidenceReason", () => {
    expect(() =>
      DiscoveryValidationRules.validateDeadEndDecision({
        deadEndFailurePattern: ["a"],
        deadEndEvidenceReason: "",
      })
    ).toThrow(ValidationError);
  });

  it("records event log", () => {
    db.insert(eventLogs).values({
      id: "evt-1",
      actorId: "user-1",
      discoveryId: "disc-1",
      eventType: "STATUS_CHANGE",
      metadata: { from: "OPEN", to: "DEAD_END" },
    }).run();

    const logs = db.select().from(eventLogs).where(eq(eventLogs.discoveryId, "disc-1")).all();
    expect(logs).toHaveLength(1);
  });
});
