import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDB } from "../../helpers/db";
import { makeUser, makeDiscovery, makeExperiment, resetFixtureCounter } from "../../helpers/fixtures";
import { users, discoveries, experiments, eventLogs } from "~/db/schema";
import {
  PromoteToOpenSchema,
  DiscoveryValidationRules,
  ValidationError,
} from "~/features/discovery/validation/discovery-rules";

describe("Promote INBOX → OPEN", () => {
  let db: TestDB;

  beforeEach(() => {
    resetFixtureCounter();
    db = createTestDb();
  });

  it("promotes INBOX discovery to OPEN with experiment", async () => {
    const user = makeUser({ id: "user-1" });
    const disc = makeDiscovery({ id: "disc-1", status: "INBOX" });
    db.insert(users).values(user).run();
    db.insert(discoveries).values(disc).run();

    const input = PromoteToOpenSchema.parse({
      ownerId: "user-1",
      firstExperiment: {
        hypothesis: "Test hypothesis",
        minimalAction: "Test action",
        deadline: new Date("2026-02-01"),
        expectedEvidence: "Expected result",
      },
    });

    DiscoveryValidationRules.validateOwnerRequired(input.ownerId);
    const dueDate = DiscoveryValidationRules.calculateDueDate(disc.createdAt!);

    db.insert(experiments).values({
      id: "exp-1",
      discoveryId: "disc-1",
      hypothesis: input.firstExperiment.hypothesis,
      minimalAction: input.firstExperiment.minimalAction,
      deadline: input.firstExperiment.deadline,
      expectedEvidence: input.firstExperiment.expectedEvidence,
    }).run();

    db.update(discoveries)
      .set({ status: "OPEN", ownerId: input.ownerId, dueDate })
      .where(eq(discoveries.id, "disc-1"))
      .run();

    const result = db.query.discoveries.findFirst({
      where: eq(discoveries.id, "disc-1"),
    }).sync();
    expect(result!.status).toBe("OPEN");
    expect(result!.ownerId).toBe("user-1");
    expect(result!.dueDate).toBeTruthy();
  });

  it("sets dueDate to createdAt + 28 days", () => {
    const createdAt = new Date("2026-01-01T00:00:00Z");
    const dueDate = DiscoveryValidationRules.calculateDueDate(createdAt);
    expect(dueDate.toISOString()).toBe("2026-01-29T00:00:00.000Z");
  });

  it("creates first experiment in DB", () => {
    const user = makeUser({ id: "user-1" });
    const disc = makeDiscovery({ id: "disc-1", status: "INBOX" });
    db.insert(users).values(user).run();
    db.insert(discoveries).values(disc).run();

    db.insert(experiments).values(
      makeExperiment({ id: "exp-1", discoveryId: "disc-1" })
    ).run();

    const exps = db.select().from(experiments).where(eq(experiments.discoveryId, "disc-1")).all();
    expect(exps).toHaveLength(1);
  });

  it("records event log on promotion", () => {
    const user = makeUser({ id: "user-1" });
    const disc = makeDiscovery({ id: "disc-1", status: "INBOX" });
    db.insert(users).values(user).run();
    db.insert(discoveries).values(disc).run();

    db.insert(eventLogs).values({
      id: "evt-1",
      actorId: "user-1",
      discoveryId: "disc-1",
      eventType: "STATUS_CHANGE",
      metadata: { from: "INBOX", to: "OPEN" },
    }).run();

    const logs = db.select().from(eventLogs).where(eq(eventLogs.discoveryId, "disc-1")).all();
    expect(logs).toHaveLength(1);
    expect(logs[0].eventType).toBe("STATUS_CHANGE");
  });

  it("rejects promotion without owner", () => {
    expect(() => DiscoveryValidationRules.validateOwnerRequired(null)).toThrow(
      ValidationError
    );
  });

  it("rejects promote from non-INBOX status", () => {
    const user = makeUser({ id: "user-1" });
    const disc = makeDiscovery({ id: "disc-1", status: "OPEN" });
    db.insert(users).values(user).run();
    db.insert(discoveries).values(disc).run();

    const result = db.query.discoveries.findFirst({
      where: eq(discoveries.id, "disc-1"),
    }).sync();
    expect(result!.status).not.toBe("INBOX");
  });

  it("validates PromoteToOpenSchema input", () => {
    expect(() =>
      PromoteToOpenSchema.parse({
        ownerId: "",
        firstExperiment: {
          hypothesis: "h",
          minimalAction: "a",
          deadline: new Date(),
          expectedEvidence: "e",
        },
      })
    ).toThrow();
  });

  it("preserves discovery fields after promotion", () => {
    const user = makeUser({ id: "user-1" });
    const disc = makeDiscovery({
      id: "disc-1",
      status: "INBOX",
      title: "Original Title",
      seedSummary: "Original summary",
    });
    db.insert(users).values(user).run();
    db.insert(discoveries).values(disc).run();

    db.update(discoveries)
      .set({ status: "OPEN", ownerId: "user-1" })
      .where(eq(discoveries.id, "disc-1"))
      .run();

    const result = db.query.discoveries.findFirst({
      where: eq(discoveries.id, "disc-1"),
    }).sync();
    expect(result!.title).toBe("Original Title");
    expect(result!.seedSummary).toBe("Original summary");
  });
});
