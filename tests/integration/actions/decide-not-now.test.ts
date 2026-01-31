import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDB } from "../../helpers/db";
import { makeUser, makeDiscovery, resetFixtureCounter } from "../../helpers/fixtures";
import { users, discoveries, eventLogs } from "~/db/schema";
import {
  NotNowDecisionSchema,
  DiscoveryValidationRules,
  ValidationError,
} from "~/lib/validation/discovery-rules";

describe("Decide OPEN → NOT_NOW", () => {
  let db: TestDB;
  const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  beforeEach(() => {
    resetFixtureCounter();
    db = createTestDb();
    const user = makeUser({ id: "user-1" });
    const disc = makeDiscovery({ id: "disc-1", status: "OPEN", ownerId: "user-1" });
    db.insert(users).values(user).run();
    db.insert(discoveries).values(disc).run();
  });

  it("transitions OPEN → NOT_NOW with required fields", () => {
    const input = NotNowDecisionSchema.parse({
      decisionRationale: "Not ready yet",
      notNowTriggerType: "Technology_Maturity",
      notNowTriggerCondition: "When tech matures",
      revisitDate: futureDate,
    });

    db.update(discoveries)
      .set({
        status: "NOT_NOW",
        decisionState: "NOT_NOW",
        decisionRationale: input.decisionRationale,
        notNowTriggerType: input.notNowTriggerType,
        notNowTriggerCondition: input.notNowTriggerCondition,
        revisitDate: input.revisitDate,
        decidedAt: new Date(),
      })
      .where(eq(discoveries.id, "disc-1"))
      .run();

    const result = db.query.discoveries.findFirst({
      where: eq(discoveries.id, "disc-1"),
    }).sync();
    expect(result!.status).toBe("NOT_NOW");
    expect(result!.notNowTriggerType).toBe("Technology_Maturity");
    expect(result!.notNowTriggerCondition).toBe("When tech matures");
    expect(result!.revisitDate).toBeTruthy();
  });

  it("validates triggerType, triggerCondition, revisitDate are all set", () => {
    DiscoveryValidationRules.validateNotNowDecision({
      notNowTriggerType: "Technology_Maturity",
      notNowTriggerCondition: "Condition",
      revisitDate: futureDate,
    });
    // Should not throw
  });

  it("rejects past revisitDate via business rule", () => {
    expect(() =>
      DiscoveryValidationRules.validateNotNowDecision({
        notNowTriggerType: "Technology_Maturity",
        notNowTriggerCondition: "Condition",
        revisitDate: new Date("2020-01-01"),
      })
    ).toThrow(ValidationError);
  });

  it("rejects missing triggerType via business rule", () => {
    expect(() =>
      DiscoveryValidationRules.validateNotNowDecision({
        notNowTriggerCondition: "Condition",
        revisitDate: futureDate,
      })
    ).toThrow(ValidationError);
  });

  it("records event log", () => {
    db.insert(eventLogs).values({
      id: "evt-1",
      actorId: "user-1",
      discoveryId: "disc-1",
      eventType: "STATUS_CHANGE",
      metadata: { from: "OPEN", to: "NOT_NOW" },
    }).run();

    const logs = db.select().from(eventLogs).where(eq(eventLogs.discoveryId, "disc-1")).all();
    expect(logs).toHaveLength(1);
    expect((logs[0].metadata as Record<string, unknown>).to).toBe("NOT_NOW");
  });

  it("stores all NOT_NOW specific fields in DB", () => {
    db.update(discoveries)
      .set({
        status: "NOT_NOW",
        notNowTriggerType: "Policy_Regulation",
        notNowTriggerCondition: "Policy changes",
        revisitDate: futureDate,
      })
      .where(eq(discoveries.id, "disc-1"))
      .run();

    const result = db.query.discoveries.findFirst({
      where: eq(discoveries.id, "disc-1"),
    }).sync();
    expect(result!.notNowTriggerType).toBe("Policy_Regulation");
    expect(result!.notNowTriggerCondition).toBe("Policy changes");
  });
});
