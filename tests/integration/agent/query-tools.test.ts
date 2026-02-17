import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDB } from "../../helpers/db";
import {
  makeUser,
  makeDiscovery,
  makeExperiment,
  makeEvidence,
  resetFixtureCounter,
} from "../../helpers/fixtures";
import {
  users,
  discoveries,
  experiments,
  evidence,
  methodRuns,
  assumptions,
} from "~/db/schema";
import {
  listDiscoveries,
  getDiscoveryDetail,
  getExperimentContext,
  searchSimilar,
  getMetrics,
} from "~/lib/agent/tools/query-tools";

// query-tools expects DB (D1-based drizzle) but TestDB is better-sqlite3 based
// The drizzle API surface is compatible, so we cast
function asDB(db: TestDB) {
  return db as unknown as Parameters<typeof listDiscoveries>[0];
}

describe("Agent query-tools", () => {
  let db: TestDB;

  beforeEach(() => {
    resetFixtureCounter();
    db = createTestDb();
  });

  // ─── listDiscoveries ────────────────────────────────────────────────

  describe("listDiscoveries", () => {
    it("returns empty list when no discoveries", async () => {
      const result = JSON.parse(await listDiscoveries(asDB(db), {}));

      expect(result.total).toBe(0);
      expect(result.discoveries).toHaveLength(0);
    });

    it("lists discoveries with pagination", async () => {
      const user = makeUser();
      db.insert(users).values(user).run();

      for (let i = 0; i < 5; i++) {
        const disc = makeDiscovery({ ownerId: user.id });
        db.insert(discoveries).values(disc).run();
      }

      const result = JSON.parse(await listDiscoveries(asDB(db), { limit: 3 }));

      expect(result.total).toBe(3);
      expect(result.hasMore).toBe(true);
    });
  });

  // ─── getDiscoveryDetail ─────────────────────────────────────────────

  describe("getDiscoveryDetail", () => {
    it("returns error for non-existent discovery", async () => {
      const result = JSON.parse(
        await getDiscoveryDetail(asDB(db), { discoveryId: "non-existent" })
      );

      expect(result.error).toBeTruthy();
    });

    it("returns discovery with experiments and evidence", async () => {
      const user = makeUser();
      db.insert(users).values(user).run();

      const disc = makeDiscovery({ id: "disc-1", ownerId: user.id });
      db.insert(discoveries).values(disc).run();

      const exp = makeExperiment({ discoveryId: "disc-1" });
      db.insert(experiments).values(exp).run();

      const ev = makeEvidence({ discoveryId: "disc-1", createdById: user.id });
      db.insert(evidence).values(ev).run();

      const result = JSON.parse(
        await getDiscoveryDetail(asDB(db), { discoveryId: "disc-1" })
      );

      expect(result.discovery.id).toBe("disc-1");
      expect(result.experiments).toHaveLength(1);
      expect(result.evidence).toHaveLength(1);
    });
  });

  // ─── getExperimentContext ───────────────────────────────────────────

  describe("getExperimentContext", () => {
    it("returns error for non-existent discovery", async () => {
      const result = JSON.parse(
        await getExperimentContext(asDB(db), { discoveryId: "non-existent" })
      );

      expect(result.error).toBeTruthy();
    });

    it("returns basic discovery context", async () => {
      const user = makeUser();
      db.insert(users).values(user).run();

      const disc = makeDiscovery({
        id: "disc-1",
        ownerId: user.id,
        status: "IDEA_CARD",
      });
      db.insert(discoveries).values(disc).run();

      const result = JSON.parse(
        await getExperimentContext(asDB(db), { discoveryId: "disc-1" })
      );

      expect(result.discovery.id).toBe("disc-1");
      expect(result.experimentSlots.used).toBe(0);
      expect(result.experimentSlots.max).toBe(2);
      expect(result.experimentSlots.canAdd).toBe(true);
    });

    it("calculates experiment slots correctly", async () => {
      const user = makeUser();
      db.insert(users).values(user).run();

      const disc = makeDiscovery({ id: "disc-1", ownerId: user.id });
      db.insert(discoveries).values(disc).run();

      // Add 2 experiments (max limit)
      const exp1 = makeExperiment({ discoveryId: "disc-1" });
      const exp2 = makeExperiment({ discoveryId: "disc-1" });
      db.insert(experiments).values([exp1, exp2]).run();

      const result = JSON.parse(
        await getExperimentContext(asDB(db), { discoveryId: "disc-1" })
      );

      expect(result.experimentSlots.used).toBe(2);
      expect(result.experimentSlots.available).toBe(0);
      expect(result.experimentSlots.canAdd).toBe(false);
      expect(result.experiments).toHaveLength(2);
    });

    it("includes method runs with pack info", async () => {
      const user = makeUser();
      db.insert(users).values(user).run();

      const disc = makeDiscovery({ id: "disc-1", ownerId: user.id });
      db.insert(discoveries).values(disc).run();

      // Method pack is seeded by migration, use MP-01
      db.insert(methodRuns).values({
        id: "run-1",
        discoveryId: "disc-1",
        methodPackId: "MP-01",
        status: "COMPLETED",
        structuredOutput: {
          frictionMap: [{ point: "검색 느림", severity: "high" }],
          assumptions: [{ statement: "사용자는 빠른 응답을 원한다", validated: false }],
        },
      }).run();

      const result = JSON.parse(
        await getExperimentContext(asDB(db), { discoveryId: "disc-1" })
      );

      expect(result.methodRuns).toHaveLength(1);
      expect(result.methodRuns[0].methodPackId).toBe("MP-01");
      expect(result.methodRuns[0].methodPackName).toBe("JTBD + 마찰지도");
      expect(result.methodRuns[0].tier).toBe("Tier-0");
      expect(result.methodRuns[0].structuredOutput).toBeTruthy();
    });

    it("includes assumptions with status", async () => {
      const user = makeUser();
      db.insert(users).values(user).run();

      const disc = makeDiscovery({ id: "disc-1", ownerId: user.id });
      db.insert(discoveries).values(disc).run();

      db.insert(assumptions).values({
        id: "asm-1",
        discoveryId: "disc-1",
        statement: "타겟 고객은 Z세대이다",
        refutationQuestions: ["Z세대 외 다른 세그먼트는?"],
        status: "OPEN",
      }).run();

      const result = JSON.parse(
        await getExperimentContext(asDB(db), { discoveryId: "disc-1" })
      );

      expect(result.assumptions).toHaveLength(1);
      expect(result.assumptions[0].status).toBe("OPEN");
      expect(result.recommendations.unvalidatedAssumptions).toHaveLength(1);
    });

    it("calculates evidence summary by strength", async () => {
      const user = makeUser();
      db.insert(users).values(user).run();

      const disc = makeDiscovery({ id: "disc-1", ownerId: user.id });
      db.insert(discoveries).values(disc).run();

      // Add evidence with different strengths
      const ev1 = makeEvidence({
        discoveryId: "disc-1",
        createdById: user.id,
        strength: "A",
      });
      const ev2 = makeEvidence({
        discoveryId: "disc-1",
        createdById: user.id,
        strength: "B",
      });
      const ev3 = makeEvidence({
        discoveryId: "disc-1",
        createdById: user.id,
        strength: "C",
      });
      db.insert(evidence).values([ev1, ev2, ev3]).run();

      const result = JSON.parse(
        await getExperimentContext(asDB(db), { discoveryId: "disc-1" })
      );

      expect(result.evidenceSummary.total).toBe(3);
      expect(result.evidenceSummary.byStrength.A).toBe(1);
      expect(result.evidenceSummary.byStrength.B).toBe(1);
      expect(result.evidenceSummary.byStrength.C).toBe(1);
      expect(result.evidenceSummary.strongEvidence).toHaveLength(2);
    });

    it("generates experiment recommendations from method run output", async () => {
      const user = makeUser();
      db.insert(users).values(user).run();

      const disc = makeDiscovery({ id: "disc-1", ownerId: user.id });
      db.insert(discoveries).values(disc).run();

      // Add completed method run with friction points
      db.insert(methodRuns).values({
        id: "run-1",
        discoveryId: "disc-1",
        methodPackId: "MP-01",
        status: "COMPLETED",
        structuredOutput: {
          friction_points: [{ issue: "복잡한 온보딩" }],
        },
      }).run();

      const result = JSON.parse(
        await getExperimentContext(asDB(db), { discoveryId: "disc-1" })
      );

      expect(result.recommendations.suggestedExperimentFocus.length).toBeGreaterThan(0);
      expect(
        result.recommendations.suggestedExperimentFocus.some((f: string) =>
          f.includes("마찰")
        )
      ).toBe(true);
    });

    it("recommends next method packs if Tier-0 not executed", async () => {
      const user = makeUser();
      db.insert(users).values(user).run();

      const disc = makeDiscovery({ id: "disc-1", ownerId: user.id });
      db.insert(discoveries).values(disc).run();

      // No method runs executed

      const result = JSON.parse(
        await getExperimentContext(asDB(db), { discoveryId: "disc-1" })
      );

      expect(result.recommendations.nextMethodPacks).toContain("MP-01");
      expect(result.recommendations.nextMethodPacks).toContain("MP-02");
    });

    it("excludes executed method packs from recommendations", async () => {
      const user = makeUser();
      db.insert(users).values(user).run();

      const disc = makeDiscovery({ id: "disc-1", ownerId: user.id });
      db.insert(discoveries).values(disc).run();

      // Execute MP-01
      db.insert(methodRuns).values({
        id: "run-1",
        discoveryId: "disc-1",
        methodPackId: "MP-01",
        status: "COMPLETED",
      }).run();

      const result = JSON.parse(
        await getExperimentContext(asDB(db), { discoveryId: "disc-1" })
      );

      expect(result.recommendations.nextMethodPacks).not.toContain("MP-01");
      expect(result.recommendations.nextMethodPacks).toContain("MP-02");
    });
  });

  // ─── searchSimilar ─────────────────────────────────────────────────

  describe("searchSimilar", () => {
    it("returns empty for short query (less than 2 chars)", async () => {
      const result = JSON.parse(await searchSimilar(asDB(db), { query: "a" }));

      expect(result.results).toHaveLength(0);
      expect(result.message).toContain("최소 2자");
    });

    it("returns empty for query with only special characters", async () => {
      const result = JSON.parse(await searchSimilar(asDB(db), { query: "***()[]" }));

      expect(result.results).toHaveLength(0);
      expect(result.message).toContain("유효한 검색어");
    });

    it("escapes special characters and searches", async () => {
      const user = makeUser();
      db.insert(users).values(user).run();

      const disc = makeDiscovery({
        id: "disc-1",
        ownerId: user.id,
        title: "테스트 검색",
        seedSummary: "이것은 테스트입니다",
      });
      db.insert(discoveries).values(disc).run();

      // Query with special characters should be escaped and work
      const result = JSON.parse(await searchSimilar(asDB(db), { query: "테스트*검색" }));

      // FTS5 will fail in test env (better-sqlite3), falls back to LIKE
      // Either way, should not throw error
      expect(result.results).toBeDefined();
    });

    it("limits query length to 50 characters", async () => {
      const user = makeUser();
      db.insert(users).values(user).run();

      const disc = makeDiscovery({
        id: "disc-1",
        ownerId: user.id,
        title: "짧은제목",
        seedSummary: "짧은요약",
      });
      db.insert(discoveries).values(disc).run();

      // Very long query should be truncated and not crash
      const longQuery = "a".repeat(100);
      const result = JSON.parse(await searchSimilar(asDB(db), { query: longQuery }));

      // Should not throw, results may be empty
      expect(result.results).toBeDefined();
    });
  });

  // ─── getMetrics ─────────────────────────────────────────────────────

  describe("getMetrics", () => {
    it("returns zero counts when no discoveries", async () => {
      const result = JSON.parse(await getMetrics(asDB(db), {}));

      expect(result.total).toBe(0);
      expect(result.agentCreated).toBe(0);
    });

    it("counts discoveries by status", async () => {
      const user = makeUser();
      db.insert(users).values(user).run();

      const disc1 = makeDiscovery({ ownerId: user.id, status: "DISCOVERY" });
      const disc2 = makeDiscovery({ ownerId: user.id, status: "IDEA_CARD" });
      const disc3 = makeDiscovery({ ownerId: user.id, status: "IDEA_CARD" });
      db.insert(discoveries).values([disc1, disc2, disc3]).run();

      const result = JSON.parse(await getMetrics(asDB(db), {}));

      expect(result.total).toBe(3);
      expect(result.statusCounts["DISCOVERY"]).toBe(1);
      expect(result.statusCounts["IDEA_CARD"]).toBe(2);
    });
  });
});
