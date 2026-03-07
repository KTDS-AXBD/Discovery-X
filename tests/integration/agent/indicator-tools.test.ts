import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDB } from "../../helpers/db";
import {
  makeUser,
  makeDiscovery,
  makeDiscoveryKpi,
  makeKpiMeasurement,
  makeExperiment,
  makeEvidence,
  resetFixtureCounter,
} from "../../helpers/fixtures";
import {
  users,
  discoveries,
  discoveryKpis,
  kpiMeasurements,
  experiments,
  evidence,
  eventLogs,
} from "~/db";
import {
  registerKpi,
  recordKpiMeasurement,
  getKpiStatus,
  getPipelineHealth,
} from "~/features/chat/agent/tools/indicator-tools";

function asDB(db: TestDB) {
  return db as unknown as Parameters<typeof registerKpi>[0];
}

describe("Agent indicator-tools", () => {
  let db: TestDB;

  beforeEach(() => {
    resetFixtureCounter();
    db = createTestDb();
  });

  // ─── registerKpi ────────────────────────────────────────────────────

  describe("registerKpi", () => {
    it("returns error for non-existent discovery", async () => {
      const result = JSON.parse(
        await registerKpi(asDB(db), {
          discoveryId: "non-existent",
          name: "Test KPI",
          unit: "count",
        })
      );

      expect(result.error).toContain("찾을 수 없습니다");
    });

    it("registers KPI successfully", async () => {
      const user = makeUser();
      db.insert(users).values(user).run();

      const disc = makeDiscovery({ id: "disc-1", ownerId: user.id });
      db.insert(discoveries).values(disc).run();

      const result = JSON.parse(
        await registerKpi(asDB(db), {
          discoveryId: "disc-1",
          name: "Conversion Rate",
          unit: "%",
          targetValue: 10,
          warningThreshold: 5,
          criticalThreshold: 2,
        })
      );

      expect(result.success).toBe(true);
      expect(result.kpiId).toBeDefined();
      expect(result.message).toContain("Conversion Rate");
    });

    it("respects max 5 KPIs per discovery limit", async () => {
      const user = makeUser();
      db.insert(users).values(user).run();

      const disc = makeDiscovery({ id: "disc-1", ownerId: user.id });
      db.insert(discoveries).values(disc).run();

      // Add 5 KPIs
      for (let i = 1; i <= 5; i++) {
        const kpi = makeDiscoveryKpi({ discoveryId: "disc-1", name: `KPI ${i}` });
        db.insert(discoveryKpis).values(kpi).run();
      }

      // Try to add 6th
      const result = JSON.parse(
        await registerKpi(asDB(db), {
          discoveryId: "disc-1",
          name: "6th KPI",
          unit: "count",
        })
      );

      expect(result.error).toContain("최대 5개");
    });

    it("sets default direction to higher_is_better", async () => {
      const user = makeUser();
      db.insert(users).values(user).run();

      const disc = makeDiscovery({ id: "disc-1", ownerId: user.id });
      db.insert(discoveries).values(disc).run();

      await registerKpi(asDB(db), {
        discoveryId: "disc-1",
        name: "Test KPI",
        unit: "count",
      });

      const kpis = db.select().from(discoveryKpis).all();
      expect(kpis[0].direction).toBe("higher_is_better");
    });
  });

  // ─── recordKpiMeasurement ─────────────────────────────────────────────

  describe("recordKpiMeasurement", () => {
    it("returns error for non-existent KPI", async () => {
      const result = JSON.parse(
        await recordKpiMeasurement(asDB(db), {
          kpiId: "non-existent",
          value: 100,
        })
      );

      expect(result.error).toContain("찾을 수 없습니다");
    });

    it("records measurement successfully", async () => {
      const user = makeUser();
      db.insert(users).values(user).run();

      const disc = makeDiscovery({ id: "disc-1", ownerId: user.id });
      db.insert(discoveries).values(disc).run();

      const kpi = makeDiscoveryKpi({ id: "kpi-1", discoveryId: "disc-1" });
      db.insert(discoveryKpis).values(kpi).run();

      const result = JSON.parse(
        await recordKpiMeasurement(asDB(db), {
          kpiId: "kpi-1",
          value: 75,
          note: "Initial measurement",
        })
      );

      expect(result.success).toBe(true);
      expect(result.measurementId).toBeDefined();
      expect(result.value).toBe(75);
    });

    it("triggers critical warning when threshold violated (higher_is_better)", async () => {
      const user = makeUser();
      db.insert(users).values(user).run();

      const disc = makeDiscovery({ id: "disc-1", ownerId: user.id });
      db.insert(discoveries).values(disc).run();

      const kpi = makeDiscoveryKpi({
        id: "kpi-1",
        discoveryId: "disc-1",
        direction: "higher_is_better",
        criticalThreshold: 10,
        warningThreshold: 20,
      });
      db.insert(discoveryKpis).values(kpi).run();

      const result = JSON.parse(
        await recordKpiMeasurement(asDB(db), {
          kpiId: "kpi-1",
          value: 5, // Below critical threshold
        })
      );

      expect(result.warning).toContain("CRITICAL");
    });

    it("triggers warning when warning threshold violated", async () => {
      const user = makeUser();
      db.insert(users).values(user).run();

      const disc = makeDiscovery({ id: "disc-1", ownerId: user.id });
      db.insert(discoveries).values(disc).run();

      const kpi = makeDiscoveryKpi({
        id: "kpi-1",
        discoveryId: "disc-1",
        direction: "higher_is_better",
        criticalThreshold: 5,
        warningThreshold: 15,
      });
      db.insert(discoveryKpis).values(kpi).run();

      const result = JSON.parse(
        await recordKpiMeasurement(asDB(db), {
          kpiId: "kpi-1",
          value: 10, // Below warning but above critical
        })
      );

      expect(result.warning).toContain("주의");
    });

    it("handles lower_is_better direction correctly", async () => {
      const user = makeUser();
      db.insert(users).values(user).run();

      const disc = makeDiscovery({ id: "disc-1", ownerId: user.id });
      db.insert(discoveries).values(disc).run();

      const kpi = makeDiscoveryKpi({
        id: "kpi-1",
        discoveryId: "disc-1",
        direction: "lower_is_better",
        criticalThreshold: 100,
        warningThreshold: 80,
      });
      db.insert(discoveryKpis).values(kpi).run();

      const result = JSON.parse(
        await recordKpiMeasurement(asDB(db), {
          kpiId: "kpi-1",
          value: 150, // Above critical threshold
        })
      );

      expect(result.warning).toContain("CRITICAL");
    });
  });

  // ─── getKpiStatus ─────────────────────────────────────────────────────

  describe("getKpiStatus", () => {
    it("returns empty message when no KPIs registered", async () => {
      const result = JSON.parse(
        await getKpiStatus(asDB(db), { discoveryId: "non-existent" })
      );

      expect(result.kpis).toHaveLength(0);
      expect(result.message).toContain("등록된 KPI가 없습니다");
    });

    it("returns KPI status with measurements", async () => {
      const user = makeUser();
      db.insert(users).values(user).run();

      const disc = makeDiscovery({ id: "disc-1", ownerId: user.id });
      db.insert(discoveries).values(disc).run();

      const kpi = makeDiscoveryKpi({
        id: "kpi-1",
        discoveryId: "disc-1",
        name: "Revenue",
        unit: "$",
        targetValue: 1000,
      });
      db.insert(discoveryKpis).values(kpi).run();

      // Add measurements
      const m1 = makeKpiMeasurement({ kpiId: "kpi-1", value: 500, measuredAt: new Date("2026-01-01") });
      const m2 = makeKpiMeasurement({ kpiId: "kpi-1", value: 600, measuredAt: new Date("2026-01-02") });
      db.insert(kpiMeasurements).values([m1, m2]).run();

      const result = JSON.parse(
        await getKpiStatus(asDB(db), { discoveryId: "disc-1" })
      );

      expect(result.kpis).toHaveLength(1);
      expect(result.kpis[0].name).toBe("Revenue");
      expect(result.kpis[0].measurementCount).toBe(2);
    });

    it("calculates trend correctly", async () => {
      const user = makeUser();
      db.insert(users).values(user).run();

      const disc = makeDiscovery({ id: "disc-1", ownerId: user.id });
      db.insert(discoveries).values(disc).run();

      const kpi = makeDiscoveryKpi({ id: "kpi-1", discoveryId: "disc-1" });
      db.insert(discoveryKpis).values(kpi).run();

      // Add measurements in descending order (latest first after ordering)
      const m1 = makeKpiMeasurement({ kpiId: "kpi-1", value: 100, measuredAt: new Date("2026-01-01") });
      const m2 = makeKpiMeasurement({ kpiId: "kpi-1", value: 150, measuredAt: new Date("2026-01-02") });
      db.insert(kpiMeasurements).values([m1, m2]).run();

      const result = JSON.parse(
        await getKpiStatus(asDB(db), { discoveryId: "disc-1" })
      );

      expect(result.kpis[0].trend).toBeDefined();
    });

    it("identifies critical status correctly", async () => {
      const user = makeUser();
      db.insert(users).values(user).run();

      const disc = makeDiscovery({ id: "disc-1", ownerId: user.id });
      db.insert(discoveries).values(disc).run();

      const kpi = makeDiscoveryKpi({
        id: "kpi-1",
        discoveryId: "disc-1",
        direction: "higher_is_better",
        criticalThreshold: 50,
      });
      db.insert(discoveryKpis).values(kpi).run();

      const m1 = makeKpiMeasurement({ kpiId: "kpi-1", value: 30 }); // Below critical
      db.insert(kpiMeasurements).values(m1).run();

      const result = JSON.parse(
        await getKpiStatus(asDB(db), { discoveryId: "disc-1" })
      );

      expect(result.kpis[0].status).toBe("critical");
    });
  });

  // ─── getPipelineHealth ────────────────────────────────────────────────

  describe("getPipelineHealth", () => {
    it("returns zero counts when no data", async () => {
      const result = JSON.parse(await getPipelineHealth(asDB(db), {}));

      expect(result.summary.totalDiscoveries).toBe(0);
      expect(result.summary.activeCount).toBe(0);
    });

    it("calculates discovery counts correctly", async () => {
      const user = makeUser();
      db.insert(users).values(user).run();

      const disc1 = makeDiscovery({ ownerId: user.id, status: "DISCOVERY" });
      const disc2 = makeDiscovery({ ownerId: user.id, status: "EXPERIMENT" });
      const disc3 = makeDiscovery({ ownerId: user.id, status: "HOLD" });
      const disc4 = makeDiscovery({ ownerId: user.id, status: "DROP" });
      db.insert(discoveries).values([disc1, disc2, disc3, disc4]).run();

      const result = JSON.parse(await getPipelineHealth(asDB(db), {}));

      expect(result.summary.totalDiscoveries).toBe(4);
      expect(result.summary.activeCount).toBe(2); // DISCOVERY + EXPERIMENT
      expect(result.summary.terminalCount).toBe(2); // HOLD + DROP
    });

    it("calculates evidence quality distribution", async () => {
      const user = makeUser();
      db.insert(users).values(user).run();

      const disc = makeDiscovery({ id: "disc-1", ownerId: user.id });
      db.insert(discoveries).values(disc).run();

      const ev1 = makeEvidence({ discoveryId: "disc-1", createdById: user.id, strength: "A" });
      const ev2 = makeEvidence({ discoveryId: "disc-1", createdById: user.id, strength: "B" });
      const ev3 = makeEvidence({ discoveryId: "disc-1", createdById: user.id, strength: "C" });
      const ev4 = makeEvidence({ discoveryId: "disc-1", createdById: user.id, strength: "D" });
      db.insert(evidence).values([ev1, ev2, ev3, ev4]).run();

      const result = JSON.parse(await getPipelineHealth(asDB(db), {}));

      expect(result.evidenceByStrength["A"]).toBe(1);
      expect(result.evidenceByStrength["B"]).toBe(1);
      expect(result.summary.strongEvidenceRatio).toBe("50%"); // 2 out of 4
    });

    it("calculates experiment completion rate", async () => {
      const user = makeUser();
      db.insert(users).values(user).run();

      const disc = makeDiscovery({ id: "disc-1", ownerId: user.id });
      db.insert(discoveries).values(disc).run();

      const exp1 = makeExperiment({ discoveryId: "disc-1", completedAt: new Date() });
      const exp2 = makeExperiment({ discoveryId: "disc-1", completedAt: null });
      db.insert(experiments).values([exp1, exp2]).run();

      const result = JSON.parse(await getPipelineHealth(asDB(db), {}));

      expect(result.summary.experimentCompletionRate).toBe("50%");
    });

    it("counts overdue discoveries", async () => {
      const user = makeUser();
      db.insert(users).values(user).run();

      const pastDue = new Date("2025-01-01");
      const disc1 = makeDiscovery({ ownerId: user.id, status: "EXPERIMENT", dueDate: pastDue });
      const disc2 = makeDiscovery({ ownerId: user.id, status: "HOLD", dueDate: pastDue }); // Terminal - not counted
      db.insert(discoveries).values([disc1, disc2]).run();

      const result = JSON.parse(await getPipelineHealth(asDB(db), {}));

      expect(result.summary.overdueCount).toBe(1);
    });

    it("tracks stage transitions from event logs", async () => {
      const user = makeUser();
      db.insert(users).values(user).run();

      const disc = makeDiscovery({ id: "disc-1", ownerId: user.id });
      db.insert(discoveries).values(disc).run();

      db.insert(eventLogs).values({
        id: "event-1",
        eventType: "stage_transition",
        actorId: user.id,
        discoveryId: "disc-1",
        metadata: { fromStatus: "DISCOVERY", toStatus: "IDEA_CARD" },
      }).run();

      const result = JSON.parse(await getPipelineHealth(asDB(db), {}));

      expect(result.stageTransitions["DISCOVERY → IDEA_CARD"]).toBe(1);
    });
  });
});
