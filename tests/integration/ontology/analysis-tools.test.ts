import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDB } from "../../helpers/db";
import {
  makeUser,
  makeDiscovery,
  makeContextNode,
  makeContextEdge,
  resetFixtureCounter,
} from "../../helpers/fixtures";
import {
  discoveries,
  users,
  contextNodes,
  contextEdges,
  ontologyTypes,
  tenants,
  tenantMembers,
} from "~/db/schema";
import {
  analyzePatterns,
  analyzeContradictions,
  analyzeClusters,
  analyzeCentralityTool,
} from "~/lib/agent/tools/ontology-tools";

function asDB(db: TestDB) {
  return db as unknown as Parameters<typeof analyzePatterns>[0];
}

/** Seed tenant + user + ontologyTypes base data. */
function seedTenant(db: TestDB) {
  const user = makeUser({ id: "user-1" });
  db.insert(users).values(user).run();

  db.insert(tenants)
    .values({
      id: "tenant-1",
      name: "Test Tenant",
      slug: "test-tenant",
      ownerUserId: "user-1",
    })
    .run();

  db.insert(tenantMembers)
    .values({ id: "tm-1", tenantId: "tenant-1", userId: "user-1" })
    .run();

  db.insert(ontologyTypes)
    .values([
      { id: "ONT-01", nameKo: "고객", domain: "market", color: "#111" },
      { id: "ONT-02", nameKo: "트렌드", domain: "market", color: "#222" },
      { id: "ONT-03", nameKo: "규제", domain: "regulation", color: "#333" },
      { id: "ONT-04", nameKo: "기술", domain: "tech", color: "#444" },
    ])
    .onConflictDoNothing()
    .run();
}

function seedDiscovery(db: TestDB, id: string) {
  const disc = makeDiscovery({ id, tenantId: "tenant-1" });
  db.insert(discoveries).values(disc).run();
}

describe("Ontology analysis tools (agent)", () => {
  let db: TestDB;

  beforeEach(() => {
    resetFixtureCounter();
    db = createTestDb();
    seedTenant(db);
  });

  // ─── analyzePatterns ─────────────────────────────────────────────

  describe("analyzePatterns", () => {
    it("데이터 없음 → 빈 patterns 배열", async () => {
      // No discoveries for tenant-1
      const raw = await analyzePatterns(asDB(db), { tenantId: "tenant-1" });
      const result = JSON.parse(raw);

      expect(result).toEqual([]);
    });

    it("2-hop 패턴 존재 시 패턴 포함", async () => {
      seedDiscovery(db, "disc-1");
      seedDiscovery(db, "disc-2");

      // Create 2 identical type-path edges: ONT-01 → ONT-02 (count ≥ 2)
      const n1 = makeContextNode({
        id: "n1",
        discoveryId: "disc-1",
        label: "고객A",
        ontologyTypeId: "ONT-01",
      });
      const n2 = makeContextNode({
        id: "n2",
        discoveryId: "disc-1",
        label: "트렌드A",
        ontologyTypeId: "ONT-02",
      });
      const n3 = makeContextNode({
        id: "n3",
        discoveryId: "disc-2",
        label: "고객B",
        ontologyTypeId: "ONT-01",
      });
      const n4 = makeContextNode({
        id: "n4",
        discoveryId: "disc-2",
        label: "트렌드B",
        ontologyTypeId: "ONT-02",
      });
      db.insert(contextNodes).values(n1).run();
      db.insert(contextNodes).values(n2).run();
      db.insert(contextNodes).values(n3).run();
      db.insert(contextNodes).values(n4).run();

      // 2 edges with same type-path: ONT-01 → ONT-02
      const e1 = makeContextEdge({
        id: "e1",
        fromNodeId: "n1",
        toNodeId: "n2",
        relationType: "relates_to",
      });
      const e2 = makeContextEdge({
        id: "e2",
        fromNodeId: "n3",
        toNodeId: "n4",
        relationType: "relates_to",
      });
      db.insert(contextEdges).values(e1).run();
      db.insert(contextEdges).values(e2).run();

      const raw = await analyzePatterns(asDB(db), { tenantId: "tenant-1" });
      const result = JSON.parse(raw);

      expect(result.length).toBeGreaterThanOrEqual(1);

      const pattern = result.find(
        (p: { path: string[] }) =>
          p.path[0] === "ONT-01" && p.path[1] === "ONT-02",
      );
      expect(pattern).toBeDefined();
      expect(pattern.count).toBeGreaterThanOrEqual(2);
      expect(pattern.examples.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── analyzeContradictions ───────────────────────────────────────

  describe("analyzeContradictions", () => {
    it("모순 없음 → 빈 배열", async () => {
      seedDiscovery(db, "disc-1");

      const n1 = makeContextNode({ id: "n1", discoveryId: "disc-1", label: "A" });
      const n2 = makeContextNode({ id: "n2", discoveryId: "disc-1", label: "B" });
      db.insert(contextNodes).values(n1).run();
      db.insert(contextNodes).values(n2).run();

      // Only "supports" edge — no contradiction
      const e1 = makeContextEdge({
        id: "e1",
        fromNodeId: "n1",
        toNodeId: "n2",
        relationType: "supports",
      });
      db.insert(contextEdges).values(e1).run();

      const raw = await analyzeContradictions(asDB(db), { tenantId: "tenant-1" });
      const result = JSON.parse(raw);

      expect(result).toEqual([]);
    });

    it("supports + contradicts 쌍 → 모순 감지", async () => {
      seedDiscovery(db, "disc-1");

      const n1 = makeContextNode({ id: "n1", discoveryId: "disc-1", label: "기술X" });
      const n2 = makeContextNode({ id: "n2", discoveryId: "disc-1", label: "시장Y" });
      db.insert(contextNodes).values(n1).run();
      db.insert(contextNodes).values(n2).run();

      // Both supports and contradicts between same pair
      db.insert(contextEdges)
        .values(
          makeContextEdge({
            id: "e-sup",
            fromNodeId: "n1",
            toNodeId: "n2",
            relationType: "supports",
          }),
        )
        .run();
      db.insert(contextEdges)
        .values(
          makeContextEdge({
            id: "e-con",
            fromNodeId: "n1",
            toNodeId: "n2",
            relationType: "contradicts",
          }),
        )
        .run();

      const raw = await analyzeContradictions(asDB(db), { tenantId: "tenant-1" });
      const result = JSON.parse(raw);

      expect(result.length).toBe(1);
      expect(result[0].supportEdges.length).toBe(1);
      expect(result[0].contradictEdges.length).toBe(1);
    });
  });

  // ─── analyzeClusters ─────────────────────────────────────────────

  describe("analyzeClusters", () => {
    it("연결된 노드 그룹 → 클러스터 감지", async () => {
      seedDiscovery(db, "disc-1");

      // 3 connected nodes form one cluster
      const n1 = makeContextNode({ id: "n1", discoveryId: "disc-1", label: "A" });
      const n2 = makeContextNode({ id: "n2", discoveryId: "disc-1", label: "B" });
      const n3 = makeContextNode({ id: "n3", discoveryId: "disc-1", label: "C" });
      db.insert(contextNodes).values(n1).run();
      db.insert(contextNodes).values(n2).run();
      db.insert(contextNodes).values(n3).run();

      db.insert(contextEdges)
        .values(makeContextEdge({ id: "e1", fromNodeId: "n1", toNodeId: "n2" }))
        .run();
      db.insert(contextEdges)
        .values(makeContextEdge({ id: "e2", fromNodeId: "n2", toNodeId: "n3" }))
        .run();

      const raw = await analyzeClusters(asDB(db), { tenantId: "tenant-1" });
      const result = JSON.parse(raw);

      expect(result.length).toBe(1);
      expect(result[0].nodes.length).toBe(3);
      expect(result[0].edgeCount).toBe(2);
    });

    it("분리된 그룹 → 별도 클러스터", async () => {
      seedDiscovery(db, "disc-1");

      // Group 1: n1-n2
      const n1 = makeContextNode({ id: "n1", discoveryId: "disc-1", label: "A" });
      const n2 = makeContextNode({ id: "n2", discoveryId: "disc-1", label: "B" });
      // Group 2: n3-n4
      const n3 = makeContextNode({ id: "n3", discoveryId: "disc-1", label: "C" });
      const n4 = makeContextNode({ id: "n4", discoveryId: "disc-1", label: "D" });

      db.insert(contextNodes).values(n1).run();
      db.insert(contextNodes).values(n2).run();
      db.insert(contextNodes).values(n3).run();
      db.insert(contextNodes).values(n4).run();

      db.insert(contextEdges)
        .values(makeContextEdge({ id: "e1", fromNodeId: "n1", toNodeId: "n2" }))
        .run();
      db.insert(contextEdges)
        .values(makeContextEdge({ id: "e2", fromNodeId: "n3", toNodeId: "n4" }))
        .run();

      const raw = await analyzeClusters(asDB(db), { tenantId: "tenant-1" });
      const result = JSON.parse(raw);

      // 2 separate clusters, each with 2 nodes
      expect(result.length).toBe(2);
      const sizes = result.map((c: { nodes: unknown[] }) => c.nodes.length).sort();
      expect(sizes).toEqual([2, 2]);
    });
  });

  // ─── analyzeCentralityTool ───────────────────────────────────────

  describe("analyzeCentralityTool", () => {
    it("허브 노드 → 가장 높은 degree", async () => {
      seedDiscovery(db, "disc-1");

      // Hub node n1 connected to n2, n3, n4
      const n1 = makeContextNode({
        id: "n1",
        discoveryId: "disc-1",
        label: "허브",
        ontologyTypeId: "ONT-01",
      });
      const n2 = makeContextNode({
        id: "n2",
        discoveryId: "disc-1",
        label: "리프1",
        ontologyTypeId: "ONT-02",
      });
      const n3 = makeContextNode({
        id: "n3",
        discoveryId: "disc-1",
        label: "리프2",
        ontologyTypeId: "ONT-03",
      });
      const n4 = makeContextNode({
        id: "n4",
        discoveryId: "disc-1",
        label: "리프3",
        ontologyTypeId: "ONT-04",
      });
      db.insert(contextNodes).values(n1).run();
      db.insert(contextNodes).values(n2).run();
      db.insert(contextNodes).values(n3).run();
      db.insert(contextNodes).values(n4).run();

      // n1 → n2, n1 → n3, n1 → n4
      db.insert(contextEdges)
        .values(makeContextEdge({ id: "e1", fromNodeId: "n1", toNodeId: "n2" }))
        .run();
      db.insert(contextEdges)
        .values(makeContextEdge({ id: "e2", fromNodeId: "n1", toNodeId: "n3" }))
        .run();
      db.insert(contextEdges)
        .values(makeContextEdge({ id: "e3", fromNodeId: "n1", toNodeId: "n4" }))
        .run();

      const raw = await analyzeCentralityTool(asDB(db), { tenantId: "tenant-1" });
      const result = JSON.parse(raw);

      expect(result.length).toBeGreaterThanOrEqual(1);
      // Hub should be first (highest totalDegree)
      expect(result[0].label).toBe("허브");
      expect(result[0].outDegree).toBe(3);
      expect(result[0].totalDegree).toBe(3);
    });

    it("빈 그래프 → 빈 배열", async () => {
      // No discoveries — empty tenant
      const raw = await analyzeCentralityTool(asDB(db), { tenantId: "tenant-1" });
      const result = JSON.parse(raw);

      expect(result).toEqual([]);
    });
  });
});
