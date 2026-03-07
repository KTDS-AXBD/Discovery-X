import { describe, it, expect, beforeEach } from "vitest";
import { eq, asc } from "drizzle-orm";
import { createTestDb, type TestDB } from "../../helpers/db";
import { makeUser, makeDiscovery, resetFixtureCounter } from "../../helpers/fixtures";
import { users, discoveries } from "~/db";

describe("Review Query (OPEN discoveries)", () => {
  let db: TestDB;

  beforeEach(() => {
    resetFixtureCounter();
    db = createTestDb();
    const user = makeUser({ id: "user-1" });
    db.insert(users).values(user).run();
  });

  it("returns only OPEN status discoveries", () => {
    db.insert(discoveries).values([
      makeDiscovery({ id: "d-1", status: "OPEN", ownerId: "user-1" }),
      makeDiscovery({ id: "d-2", status: "INBOX" }),
      makeDiscovery({ id: "d-3", status: "NEXT", ownerId: "user-1" }),
      makeDiscovery({ id: "d-4", status: "OPEN", ownerId: "user-1" }),
    ]).run();

    const openDiscoveries = db
      .select()
      .from(discoveries)
      .where(eq(discoveries.status, "OPEN"))
      .all();

    expect(openDiscoveries).toHaveLength(2);
    expect(openDiscoveries.every((d) => d.status === "OPEN")).toBe(true);
  });

  it("sorts by due date ascending", () => {
    db.insert(discoveries).values([
      makeDiscovery({
        id: "d-1",
        status: "OPEN",
        ownerId: "user-1",
        dueDate: new Date("2026-02-15"),
      }),
      makeDiscovery({
        id: "d-2",
        status: "OPEN",
        ownerId: "user-1",
        dueDate: new Date("2026-01-30"),
      }),
    ]).run();

    const results = db
      .select()
      .from(discoveries)
      .where(eq(discoveries.status, "OPEN"))
      .orderBy(asc(discoveries.dueDate))
      .all();

    expect(results[0].id).toBe("d-2");
    expect(results[1].id).toBe("d-1");
  });

  it("returns empty array when no OPEN discoveries", () => {
    db.insert(discoveries).values([
      makeDiscovery({ id: "d-1", status: "INBOX" }),
    ]).run();

    const results = db
      .select()
      .from(discoveries)
      .where(eq(discoveries.status, "OPEN"))
      .all();

    expect(results).toHaveLength(0);
  });
});
