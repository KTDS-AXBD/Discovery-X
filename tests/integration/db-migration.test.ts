import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDB } from "../helpers/db";
import { resetFixtureCounter } from "../helpers/fixtures";
import {
  users,
  stages,
  methodPacks,
  ontologyTypes,
  discoveries,
  evidence,
  discoveryKpis,
  kpiMeasurements,
  discoveryLinks,
  alertRules,
  alerts,
  webhookConfigs,
  gateApprovals,
  gatePackages,
  assumptions,
  contextNodes,
  contextEdges,
  methodRuns,
} from "~/db/schema";

describe("DB Migration Smoke Tests (0007~0010)", () => {
  let db: TestDB;

  beforeEach(() => {
    resetFixtureCounter();
    db = createTestDb();
  });

  // Shared setup helpers
  function seedUser() {
    db.insert(users).values({ id: "u1", email: "u1@t.com", name: "U1" }).run();
  }
  function seedDiscovery(id = "d1", title = "T") {
    db.insert(discoveries)
      .values({ id, title, seedSummary: "S", sourceType: "article", status: "DISCOVERY" })
      .run();
  }

  describe("0007: Stage System", () => {
    it("seeds 11 stages", () => {
      const rows = db.select().from(stages).all();
      expect(rows).toHaveLength(11);
    });

    it("has correct stage IDs", () => {
      const rows = db.select().from(stages).all();
      const ids = rows.map((r) => r.id);
      const expected = [
        "DISCOVERY", "IDEA_CARD", "HYPOTHESIS", "EXPERIMENT", "EVIDENCE_REVIEW",
        "GATE1", "SPRINT", "GATE2", "HANDOFF", "HOLD", "DROP",
      ];
      for (const s of expected) {
        expect(ids).toContain(s);
      }
    });

    it("has stage categories", () => {
      const rows = db.select().from(stages).all();
      const categories = [...new Set(rows.map((r) => r.category))];
      expect(categories).toContain("ideation");
      expect(categories).toContain("validation");
      expect(categories).toContain("execution");
      expect(categories).toContain("terminal");
    });

    it("discoveries table has stageUpdatedAt column", () => {
      db.insert(discoveries)
        .values({
          id: "smoke-d1",
          title: "Smoke Test",
          seedSummary: "test",
          sourceType: "article",
          status: "DISCOVERY",
          stageUpdatedAt: new Date(),
        })
        .run();

      const row = db.select().from(discoveries).all();
      expect(row[0].stageUpdatedAt).toBeTruthy();
    });

    it("evidence table has v3 columns", () => {
      seedUser();
      seedDiscovery();

      db.insert(evidence)
        .values({
          id: "ev1",
          discoveryId: "d1",
          createdById: "u1",
          type: "DATA",
          strength: "B",
          content: "test",
          reliabilityLabel: "confirmed",
          sourceUrl: "https://example.com",
          publishedOrObservedDate: "2026-01-01",
        })
        .run();

      const row = db.select().from(evidence).all();
      expect(row[0].reliabilityLabel).toBe("confirmed");
      expect(row[0].sourceUrl).toBe("https://example.com");
      expect(row[0].publishedOrObservedDate).toBe("2026-01-01");
    });
  });

  describe("0008: Method Packs", () => {
    it("seeds 12 method packs", () => {
      const rows = db.select().from(methodPacks).all();
      expect(rows).toHaveLength(12);
    });

    it("has Tier-0 packs", () => {
      const rows = db.select().from(methodPacks).all();
      const tier0 = rows.filter((r) => r.tier === "Tier-0");
      expect(tier0.length).toBeGreaterThanOrEqual(2);
    });

    it("method_runs table exists", () => {
      seedUser();
      seedDiscovery();

      db.insert(methodRuns)
        .values({ id: "mr-1", discoveryId: "d1", methodPackId: "MP-01", status: "RUNNING" })
        .run();

      const rows = db.select().from(methodRuns).all();
      expect(rows).toHaveLength(1);
    });

    it("gate_packages and assumptions tables exist", () => {
      seedUser();
      seedDiscovery();

      db.insert(gatePackages)
        .values({ id: "gp-1", discoveryId: "d1", gateType: "GATE1" })
        .run();

      db.insert(assumptions)
        .values({ id: "a-1", discoveryId: "d1", statement: "Test assumption" })
        .run();

      expect(db.select().from(gatePackages).all()).toHaveLength(1);
      expect(db.select().from(assumptions).all()).toHaveLength(1);
    });
  });

  describe("0009: Ontology Graph", () => {
    it("seeds 10 ontology types", () => {
      const rows = db.select().from(ontologyTypes).all();
      expect(rows).toHaveLength(10);
    });

    it("context_nodes and context_edges tables exist", () => {
      seedUser();
      seedDiscovery();

      db.insert(contextNodes)
        .values({ id: "cn-1", discoveryId: "d1", label: "Node 1", ontologyTypeId: "ONT-01" })
        .run();
      db.insert(contextNodes)
        .values({ id: "cn-2", discoveryId: "d1", label: "Node 2", ontologyTypeId: "ONT-02" })
        .run();

      db.insert(contextEdges)
        .values({ id: "ce-1", fromNodeId: "cn-1", toNodeId: "cn-2", relationType: "supports" })
        .run();

      expect(db.select().from(contextNodes).all()).toHaveLength(2);
      expect(db.select().from(contextEdges).all()).toHaveLength(1);
    });
  });

  describe("0010: R3 Indicators & Connectors", () => {
    it("discoveries table has gatekeeperId column", () => {
      seedUser();
      db.insert(discoveries)
        .values({
          id: "d1",
          title: "T",
          seedSummary: "S",
          sourceType: "article",
          status: "DISCOVERY",
          gatekeeperId: "u1",
        })
        .run();

      const row = db.select().from(discoveries).all();
      expect(row[0].gatekeeperId).toBe("u1");
    });

    it("discovery_kpis and kpi_measurements tables exist", () => {
      seedUser();
      seedDiscovery();

      db.insert(discoveryKpis)
        .values({ id: "kpi-1", discoveryId: "d1", name: "MAU", unit: "count", direction: "higher_is_better" })
        .run();

      db.insert(kpiMeasurements)
        .values({ id: "km-1", kpiId: "kpi-1", value: 500 })
        .run();

      expect(db.select().from(discoveryKpis).all()).toHaveLength(1);
      expect(db.select().from(kpiMeasurements).all()).toHaveLength(1);
    });

    it("discovery_links table exists", () => {
      seedUser();
      seedDiscovery("d1", "T1");
      seedDiscovery("d2", "T2");

      db.insert(discoveryLinks)
        .values({ id: "dl-1", fromDiscoveryId: "d1", toDiscoveryId: "d2", linkType: "similar" })
        .run();

      expect(db.select().from(discoveryLinks).all()).toHaveLength(1);
    });

    it("alert_rules, alerts, webhook_configs, gate_approvals tables exist", () => {
      seedUser();
      seedDiscovery();

      db.insert(alertRules)
        .values({ id: "ar-1", alertType: "kpi_threshold", name: "KPI Alert" })
        .run();

      db.insert(alerts)
        .values({ id: "al-1", discoveryId: "d1", severity: "warning", message: "Test alert" })
        .run();

      db.insert(webhookConfigs)
        .values({ id: "wh-1", name: "Slack", url: "https://hooks.slack.com/xxx" })
        .run();

      db.insert(gatePackages)
        .values({ id: "gp-1", discoveryId: "d1", gateType: "GATE1" })
        .run();

      db.insert(gateApprovals)
        .values({ id: "ga-1", gatePackageId: "gp-1", reviewerId: "u1" })
        .run();

      expect(db.select().from(alertRules).all()).toHaveLength(1);
      expect(db.select().from(alerts).all()).toHaveLength(1);
      expect(db.select().from(webhookConfigs).all()).toHaveLength(1);
      expect(db.select().from(gateApprovals).all()).toHaveLength(1);
    });
  });
});
