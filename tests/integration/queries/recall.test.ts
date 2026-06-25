import { describe, it, expect, beforeEach } from "vitest";
import { eq, lte, and } from "drizzle-orm";
import { createTestDb, type TestDB } from "../../helpers/db";
import { makeUser, makeDiscovery, resetFixtureCounter } from "../../helpers/fixtures";
import { users, discoveries } from "~/db";

describe("Recall Query (NOT_NOW with past revisitDate)", () => {
  let db: TestDB;

  beforeEach(() => {
    resetFixtureCounter();
    db = createTestDb();
    const user = makeUser({ id: "user-1" });
    db.insert(users).values(user).run();
  });

  it("returns NOT_NOW discoveries with revisitDate <= now", () => {
    const pastDate = new Date("2025-12-01");
    const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1년 후 (상대 날짜, 시간 폭탄 방지)

    db.insert(discoveries).values([
      makeDiscovery({
        id: "d-1",
        status: "NOT_NOW",
        ownerId: "user-1",
        revisitDate: pastDate,
        notNowTriggerType: "Technology_Maturity",
      }),
      makeDiscovery({
        id: "d-2",
        status: "NOT_NOW",
        ownerId: "user-1",
        revisitDate: futureDate,
        notNowTriggerType: "Policy_Regulation",
      }),
      makeDiscovery({
        id: "d-3",
        status: "OPEN",
        ownerId: "user-1",
      }),
    ]).run();

    const now = new Date();
    const recalls = db
      .select()
      .from(discoveries)
      .where(
        and(
          eq(discoveries.status, "NOT_NOW"),
          lte(discoveries.revisitDate, now)
        )
      )
      .all();

    expect(recalls).toHaveLength(1);
    expect(recalls[0].id).toBe("d-1");
  });

  it("returns empty when no NOT_NOW discoveries are due", () => {
    const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1년 후 (상대 날짜, 시간 폭탄 방지)

    db.insert(discoveries).values([
      makeDiscovery({
        id: "d-1",
        status: "NOT_NOW",
        ownerId: "user-1",
        revisitDate: futureDate,
      }),
    ]).run();

    const now = new Date();
    const recalls = db
      .select()
      .from(discoveries)
      .where(
        and(
          eq(discoveries.status, "NOT_NOW"),
          lte(discoveries.revisitDate, now)
        )
      )
      .all();

    expect(recalls).toHaveLength(0);
  });

  it("excludes non-NOT_NOW discoveries even with revisitDate", () => {
    const pastDate = new Date("2025-12-01");

    db.insert(discoveries).values([
      makeDiscovery({
        id: "d-1",
        status: "OPEN",
        ownerId: "user-1",
        revisitDate: pastDate,
      }),
    ]).run();

    const now = new Date();
    const recalls = db
      .select()
      .from(discoveries)
      .where(
        and(
          eq(discoveries.status, "NOT_NOW"),
          lte(discoveries.revisitDate, now)
        )
      )
      .all();

    expect(recalls).toHaveLength(0);
  });
});
