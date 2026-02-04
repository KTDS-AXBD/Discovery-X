import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDB } from "../../helpers/db";
import { makeUser, makeDiscovery, resetFixtureCounter } from "../../helpers/fixtures";
import { users, discoveries } from "~/db/schema";
import { ACTIVE_STATUSES } from "~/lib/constants/status";
import { buildWeeklySummaryEmail, type WeeklySummaryData } from "~/lib/notifications/templates";

describe("Weekly Summary", () => {
  let db: TestDB;

  beforeEach(() => {
    resetFixtureCounter();
    db = createTestDb();
  });

  describe("data collection logic", () => {
    it("counts active discoveries by status", () => {
      const owner = makeUser({ id: "owner-1" });
      db.insert(users).values(owner).run();

      db.insert(discoveries)
        .values([
          makeDiscovery({ status: "IDEA_CARD", ownerId: owner.id }),
          makeDiscovery({ status: "IDEA_CARD", ownerId: owner.id }),
          makeDiscovery({ status: "EXPERIMENT", ownerId: owner.id }),
          makeDiscovery({ status: "GATE1", ownerId: owner.id }),
          makeDiscovery({ status: "HOLD", ownerId: owner.id }),
          makeDiscovery({ status: "DROP", ownerId: owner.id }),
          makeDiscovery({ status: "HANDOFF", ownerId: owner.id }),
        ])
        .run();

      const allDisc = db.select().from(discoveries).all();
      const activeStatuses = new Set<string>(ACTIVE_STATUSES);
      const active = allDisc.filter((d) => activeStatuses.has(d.status));

      expect(active).toHaveLength(4); // 2 IDEA_CARD + 1 EXPERIMENT + 1 GATE1
      expect(allDisc).toHaveLength(7);
    });

    it("identifies overdue discoveries", () => {
      const owner = makeUser({ id: "owner-1" });
      db.insert(users).values(owner).run();

      const now = new Date();
      const pastDate = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
      const futureDate = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);

      db.insert(discoveries)
        .values([
          makeDiscovery({ status: "IDEA_CARD", ownerId: owner.id, dueDate: pastDate }),
          makeDiscovery({ status: "EXPERIMENT", ownerId: owner.id, dueDate: futureDate }),
          makeDiscovery({ status: "HYPOTHESIS", ownerId: owner.id }), // no due date
        ])
        .run();

      const allDisc = db.select().from(discoveries).all();
      const activeStatuses = new Set<string>(ACTIVE_STATUSES);
      const active = allDisc.filter((d) => activeStatuses.has(d.status));
      const overdue = active.filter((d) => d.dueDate && new Date(d.dueDate) < now);

      expect(overdue).toHaveLength(1);
    });

    it("identifies stalled discoveries (> 14 days in stage)", () => {
      const owner = makeUser({ id: "owner-1" });
      db.insert(users).values(owner).run();

      const now = new Date();
      const twentyDaysAgo = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000);
      const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);

      db.insert(discoveries)
        .values([
          makeDiscovery({ status: "IDEA_CARD", ownerId: owner.id, stageUpdatedAt: twentyDaysAgo }),
          makeDiscovery({ status: "EXPERIMENT", ownerId: owner.id, stageUpdatedAt: fiveDaysAgo }),
        ])
        .run();

      const allDisc = db.select().from(discoveries).all();
      const STAGE_SLA_DAYS = 14;
      const stalled = allDisc.filter((d) => {
        if (!d.stageUpdatedAt) return false;
        const days = (now.getTime() - new Date(d.stageUpdatedAt).getTime()) / (1000 * 60 * 60 * 24);
        return days > STAGE_SLA_DAYS;
      });

      expect(stalled).toHaveLength(1);
    });

    it("counts new discoveries from the past week", () => {
      const owner = makeUser({ id: "owner-1" });
      db.insert(users).values(owner).run();

      const now = new Date();
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
      const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      db.insert(discoveries)
        .values([
          makeDiscovery({ status: "IDEA_CARD", ownerId: owner.id, createdAt: threeDaysAgo }),
          makeDiscovery({ status: "EXPERIMENT", ownerId: owner.id, createdAt: tenDaysAgo }),
        ])
        .run();

      const allDisc = db.select().from(discoveries).all();
      const newThisWeek = allDisc.filter(
        (d) => d.createdAt && new Date(d.createdAt) >= oneWeekAgo
      );

      expect(newThisWeek).toHaveLength(1);
    });
  });

  describe("email template", () => {
    it("generates valid summary email", () => {
      const data: WeeklySummaryData = {
        totalActive: 5,
        statusCounts: { IDEA_CARD: 2, EXPERIMENT: 2, GATE1: 1 },
        overdueCount: 1,
        stalledCount: 0,
        newThisWeek: 3,
        completedThisWeek: 1,
      };

      const { subject, html } = buildWeeklySummaryEmail(data);

      expect(subject).toContain("주간 요약");
      expect(subject).toContain("Active 5건");
      expect(html).toContain("IDEA_CARD");
      expect(html).toContain("EXPERIMENT");
      expect(html).toContain("GATE1");
    });

    it("highlights overdue and stalled counts", () => {
      const data: WeeklySummaryData = {
        totalActive: 3,
        statusCounts: { IDEA_CARD: 3 },
        overdueCount: 2,
        stalledCount: 1,
        newThisWeek: 0,
        completedThisWeek: 0,
      };

      const { html } = buildWeeklySummaryEmail(data);
      // Overdue uses red when > 0
      expect(html).toContain("#dc2626");
      // Stalled uses yellow when > 0
      expect(html).toContain("#f59e0b");
    });
  });
});
