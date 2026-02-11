import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDB } from "../../helpers/db";
import {
  makeDiscovery,
  makeContextNode,
  makeContextEdge,
  makeUser,
  resetFixtureCounter,
} from "../../helpers/fixtures";
import {
  discoveries,
  contextNodes,
  contextEdges,
  contextSnapshots,
  ontologyTypes,
  tenants,
  tenantMembers,
  users,
} from "~/db/schema";
import {
  propagateInfluence,
  compareSnapshots,
} from "~/lib/ontology/simulator";

/** TestDB → DrizzleD1Database 호환 타입 캐스팅 */
function asDB(db: TestDB) {
  return db as unknown as Parameters<typeof propagateInfluence>[0];
}

/** 테스트용 공통 시드 데이터 삽입 */
function seedBase(db: TestDB) {
  // ontologyTypes (contextNodes FK 전에 반드시 시드)
  db.insert(ontologyTypes)
    .values([
      { id: "ot-market", nameKo: "시장", domain: "market", color: "#111" },
      { id: "ot-customer", nameKo: "고객", domain: "market", color: "#222" },
      { id: "ot-risk", nameKo: "리스크", domain: "strategy", color: "#333" },
      { id: "ot-tech", nameKo: "기술", domain: "tech", color: "#444" },
    ])
    .onConflictDoNothing()
    .run();

  // user + tenant + tenantMember
  db.insert(users).values(makeUser({ id: "u-1" })).run();
  db.insert(tenants)
    .values({
      id: "t-1",
      name: "Test Tenant",
      slug: "test-tenant",
      ownerUserId: "u-1",
    })
    .run();
  db.insert(tenantMembers)
    .values({ id: "tm-1", tenantId: "t-1", userId: "u-1" })
    .run();
}

/** Discovery 삽입 헬퍼 */
function insertDiscovery(db: TestDB, id: string, tenantId = "t-1") {
  db.insert(discoveries)
    .values(makeDiscovery({ id, tenantId }))
    .run();
}

/** 노드 삽입 헬퍼 */
function insertNode(
  db: TestDB,
  id: string,
  discoveryId: string,
  ontologyTypeId: string,
  opts?: { globalEntityId?: string; reviewed?: number },
) {
  db.insert(contextNodes)
    .values(
      makeContextNode({
        id,
        discoveryId,
        label: `Node-${id}`,
        ontologyTypeId,
        globalEntityId: opts?.globalEntityId ?? null,
        reviewed: opts?.reviewed ?? 0,
      }),
    )
    .run();
}

/** 엣지 삽입 헬퍼 */
function insertEdge(
  db: TestDB,
  id: string,
  fromNodeId: string,
  toNodeId: string,
  relationType = "supports",
  strength = 80,
) {
  db.insert(contextEdges)
    .values(
      makeContextEdge({
        id,
        fromNodeId,
        toNodeId,
        relationType,
        strength,
      }),
    )
    .run();
}

describe("ontology/simulator", () => {
  let db: TestDB;

  beforeEach(() => {
    resetFixtureCounter();
    db = createTestDb();
    seedBase(db);
  });

  // ====================================================================
  // 1. propagateInfluence
  // ====================================================================
  describe("propagateInfluence", () => {
    it("선형 체인 A→B→C 전파", async () => {
      insertDiscovery(db, "d-1");
      insertNode(db, "n-a", "d-1", "ot-market");
      insertNode(db, "n-b", "d-1", "ot-customer");
      insertNode(db, "n-c", "d-1", "ot-risk");
      insertEdge(db, "e-1", "n-a", "n-b", "supports", 100); // strength 1.0
      insertEdge(db, "e-2", "n-b", "n-c", "supports", 100);

      const result = await propagateInfluence(asDB(db), "t-1", "n-a", 1.0);

      expect(result.sourceNode.id).toBe("n-a");
      expect(result.totalNodes).toBe(2);
      // B: 1.0 * (100/100) * 0.7 = 0.7
      // C: 0.7 * (100/100) * 0.7 = 0.49
      const nodeB = result.affectedNodes.find((n) => n.nodeId === "n-b");
      const nodeC = result.affectedNodes.find((n) => n.nodeId === "n-c");
      expect(nodeB).toBeDefined();
      expect(nodeC).toBeDefined();
      expect(nodeB!.impact).toBeCloseTo(0.7, 2);
      expect(nodeB!.depth).toBe(1);
      expect(nodeC!.impact).toBeCloseTo(0.49, 2);
      expect(nodeC!.depth).toBe(2);
    });

    it("hop마다 decay factor 적용", async () => {
      insertDiscovery(db, "d-1");
      insertNode(db, "n-a", "d-1", "ot-market");
      insertNode(db, "n-b", "d-1", "ot-customer");
      insertNode(db, "n-c", "d-1", "ot-risk");
      insertEdge(db, "e-1", "n-a", "n-b", "supports", 100);
      insertEdge(db, "e-2", "n-b", "n-c", "supports", 100);

      // 커스텀 decay: 0.5
      const result = await propagateInfluence(asDB(db), "t-1", "n-a", 1.0, { decayFactor: 0.5 });

      const nodeB = result.affectedNodes.find((n) => n.nodeId === "n-b");
      const nodeC = result.affectedNodes.find((n) => n.nodeId === "n-c");
      // B: 1.0 * 1.0 * 0.5 = 0.5
      // C: 0.5 * 1.0 * 0.5 = 0.25
      expect(nodeB!.impact).toBeCloseTo(0.5, 2);
      expect(nodeC!.impact).toBeCloseTo(0.25, 2);
    });

    it("maxDepth 옵션 존중", async () => {
      insertDiscovery(db, "d-1");
      insertNode(db, "n-a", "d-1", "ot-market");
      insertNode(db, "n-b", "d-1", "ot-customer");
      insertNode(db, "n-c", "d-1", "ot-risk");
      insertEdge(db, "e-1", "n-a", "n-b", "supports", 100);
      insertEdge(db, "e-2", "n-b", "n-c", "supports", 100);

      const result = await propagateInfluence(asDB(db), "t-1", "n-a", 1.0, { maxDepth: 1 });

      // maxDepth=1 이므로 B만 도달, C는 미도달
      expect(result.totalNodes).toBe(1);
      expect(result.affectedNodes[0].nodeId).toBe("n-b");
      expect(result.maxDepthReached).toBe(1);
    });

    it("분기 처리 (A→B, A→C)", async () => {
      insertDiscovery(db, "d-1");
      insertNode(db, "n-a", "d-1", "ot-market");
      insertNode(db, "n-b", "d-1", "ot-customer");
      insertNode(db, "n-c", "d-1", "ot-risk");
      insertEdge(db, "e-1", "n-a", "n-b", "supports", 80);
      insertEdge(db, "e-2", "n-a", "n-c", "supports", 60);

      const result = await propagateInfluence(asDB(db), "t-1", "n-a", 1.0);

      expect(result.totalNodes).toBe(2);
      const nodeB = result.affectedNodes.find((n) => n.nodeId === "n-b");
      const nodeC = result.affectedNodes.find((n) => n.nodeId === "n-c");
      // B: 1.0 * (80/100) * 0.7 = 0.56
      // C: 1.0 * (60/100) * 0.7 = 0.42
      expect(nodeB!.impact).toBeCloseTo(0.56, 2);
      expect(nodeC!.impact).toBeCloseTo(0.42, 2);
    });

    it("사이클 감지 — 노드 재방문 방지", async () => {
      insertDiscovery(db, "d-1");
      insertNode(db, "n-a", "d-1", "ot-market");
      insertNode(db, "n-b", "d-1", "ot-customer");
      insertNode(db, "n-c", "d-1", "ot-risk");
      // A→B→C→A 사이클
      insertEdge(db, "e-1", "n-a", "n-b", "supports", 100);
      insertEdge(db, "e-2", "n-b", "n-c", "supports", 100);
      insertEdge(db, "e-3", "n-c", "n-a", "supports", 100);

      const result = await propagateInfluence(asDB(db), "t-1", "n-a", 1.0);

      // A는 소스이므로 재방문 안 됨 → B, C만 영향
      expect(result.totalNodes).toBe(2);
      const nodeIds = result.affectedNodes.map((n) => n.nodeId);
      expect(nodeIds).toContain("n-b");
      expect(nodeIds).toContain("n-c");
      // A가 결과에 없어야 함
      expect(nodeIds).not.toContain("n-a");
    });

    it("거절된 노드 (reviewed=2) 제외", async () => {
      insertDiscovery(db, "d-1");
      insertNode(db, "n-a", "d-1", "ot-market");
      insertNode(db, "n-b", "d-1", "ot-customer", { reviewed: 2 }); // 거절됨
      insertNode(db, "n-c", "d-1", "ot-risk");
      insertEdge(db, "e-1", "n-a", "n-b", "supports", 100);
      insertEdge(db, "e-2", "n-b", "n-c", "supports", 100);

      const result = await propagateInfluence(asDB(db), "t-1", "n-a", 1.0);

      // n-b가 제외되므로 A에서 전파 불가 → 영향 받는 노드 0
      expect(result.totalNodes).toBe(0);
    });

    it("고립 노드 → 빈 결과", async () => {
      insertDiscovery(db, "d-1");
      insertNode(db, "n-a", "d-1", "ot-market");
      // 엣지 없음

      const result = await propagateInfluence(asDB(db), "t-1", "n-a", 1.0);

      expect(result.totalNodes).toBe(0);
      expect(result.affectedNodes).toEqual([]);
      expect(result.maxDepthReached).toBe(0);
    });

    it("엣지 strength 가중치 반영", async () => {
      insertDiscovery(db, "d-1");
      insertNode(db, "n-a", "d-1", "ot-market");
      insertNode(db, "n-b", "d-1", "ot-customer");
      insertNode(db, "n-c", "d-1", "ot-risk");
      // 약한 엣지: strength 20 → 0.2
      insertEdge(db, "e-1", "n-a", "n-b", "supports", 20);
      // 강한 엣지: strength 100 → 1.0
      insertEdge(db, "e-2", "n-a", "n-c", "supports", 100);

      const result = await propagateInfluence(asDB(db), "t-1", "n-a", 1.0);

      const nodeB = result.affectedNodes.find((n) => n.nodeId === "n-b");
      const nodeC = result.affectedNodes.find((n) => n.nodeId === "n-c");
      // B: 1.0 * (20/100) * 0.7 = 0.14
      // C: 1.0 * (100/100) * 0.7 = 0.70
      expect(nodeB!.impact).toBeCloseTo(0.14, 2);
      expect(nodeC!.impact).toBeCloseTo(0.70, 2);
      // C가 더 높은 impact → 정렬 1위
      expect(result.affectedNodes[0].nodeId).toBe("n-c");
    });

    it("존재하지 않는 소스 노드 → 빈 결과", async () => {
      insertDiscovery(db, "d-1");

      const result = await propagateInfluence(asDB(db), "t-1", "nonexistent", 1.0);

      expect(result.totalNodes).toBe(0);
      expect(result.sourceNode.label).toBe("unknown");
    });

    it("minImpact 임계값 미만이면 전파 중단", async () => {
      insertDiscovery(db, "d-1");
      insertNode(db, "n-a", "d-1", "ot-market");
      insertNode(db, "n-b", "d-1", "ot-customer");
      insertNode(db, "n-c", "d-1", "ot-risk");
      insertEdge(db, "e-1", "n-a", "n-b", "supports", 10); // 매우 약한 엣지
      insertEdge(db, "e-2", "n-b", "n-c", "supports", 10);

      // minImpact=0.1, magnitude=1.0
      // B: 1.0 * 0.1 * 0.7 = 0.07 → minImpact(0.1) 미만 → 전파 안 됨
      const result = await propagateInfluence(asDB(db), "t-1", "n-a", 1.0, { minImpact: 0.1 });

      expect(result.totalNodes).toBe(0);
    });

    it("path에 소스→현재 노드 경로 포함", async () => {
      insertDiscovery(db, "d-1");
      insertNode(db, "n-a", "d-1", "ot-market");
      insertNode(db, "n-b", "d-1", "ot-customer");
      insertNode(db, "n-c", "d-1", "ot-risk");
      insertEdge(db, "e-1", "n-a", "n-b", "supports", 100);
      insertEdge(db, "e-2", "n-b", "n-c", "supports", 100);

      const result = await propagateInfluence(asDB(db), "t-1", "n-a", 1.0);

      const nodeC = result.affectedNodes.find((n) => n.nodeId === "n-c");
      expect(nodeC!.path).toEqual(["n-a", "n-b", "n-c"]);
    });
  });

  // ====================================================================
  // 2. compareSnapshots
  // ====================================================================
  describe("compareSnapshots", () => {
    it("추가된 노드 감지", async () => {
      insertDiscovery(db, "d-1");

      db.insert(contextSnapshots)
        .values({
          id: "snap-1",
          discoveryId: "d-1",
          stage: "DISCOVERY",
          snapshotData: {
            nodes: [{ id: "n1", label: "시장A" }],
            edges: [],
          },
        })
        .run();
      db.insert(contextSnapshots)
        .values({
          id: "snap-2",
          discoveryId: "d-1",
          stage: "HYPOTHESIS",
          snapshotData: {
            nodes: [{ id: "n1", label: "시장A" }, { id: "n2", label: "고객B" }],
            edges: [],
          },
        })
        .run();

      const diff = await compareSnapshots(asDB(db), "d-1", "DISCOVERY", "HYPOTHESIS");

      expect(diff.addedNodes).toHaveLength(1);
      expect(diff.addedNodes[0]).toEqual({ id: "n2", label: "고객B" });
      expect(diff.removedNodes).toHaveLength(0);
      expect(diff.summary).toContain("+1 nodes");
    });

    it("제거된 노드 감지", async () => {
      insertDiscovery(db, "d-1");

      db.insert(contextSnapshots)
        .values({
          id: "snap-1",
          discoveryId: "d-1",
          stage: "DISCOVERY",
          snapshotData: {
            nodes: [{ id: "n1", label: "시장A" }, { id: "n2", label: "고객B" }],
            edges: [],
          },
        })
        .run();
      db.insert(contextSnapshots)
        .values({
          id: "snap-2",
          discoveryId: "d-1",
          stage: "HYPOTHESIS",
          snapshotData: {
            nodes: [{ id: "n1", label: "시장A" }],
            edges: [],
          },
        })
        .run();

      const diff = await compareSnapshots(asDB(db), "d-1", "DISCOVERY", "HYPOTHESIS");

      expect(diff.removedNodes).toHaveLength(1);
      expect(diff.removedNodes[0]).toEqual({ id: "n2", label: "고객B" });
      expect(diff.addedNodes).toHaveLength(0);
      expect(diff.summary).toContain("-1 nodes");
    });

    it("추가/제거된 엣지 감지", async () => {
      insertDiscovery(db, "d-1");

      db.insert(contextSnapshots)
        .values({
          id: "snap-1",
          discoveryId: "d-1",
          stage: "DISCOVERY",
          snapshotData: {
            nodes: [{ id: "n1", label: "A" }, { id: "n2", label: "B" }],
            edges: [{ fromLabel: "A", toLabel: "B", relationType: "supports" }],
          },
        })
        .run();
      db.insert(contextSnapshots)
        .values({
          id: "snap-2",
          discoveryId: "d-1",
          stage: "HYPOTHESIS",
          snapshotData: {
            nodes: [{ id: "n1", label: "A" }, { id: "n2", label: "B" }],
            edges: [{ fromLabel: "A", toLabel: "B", relationType: "causes" }],
          },
        })
        .run();

      const diff = await compareSnapshots(asDB(db), "d-1", "DISCOVERY", "HYPOTHESIS");

      expect(diff.addedEdges).toHaveLength(1);
      expect(diff.addedEdges[0]).toEqual({ fromLabel: "A", toLabel: "B", relationType: "causes" });
      expect(diff.removedEdges).toHaveLength(1);
      expect(diff.removedEdges[0]).toEqual({ fromLabel: "A", toLabel: "B", relationType: "supports" });
    });

    it("동일한 스냅샷 → 빈 diff", async () => {
      insertDiscovery(db, "d-1");

      const data = {
        nodes: [{ id: "n1", label: "A" }],
        edges: [{ fromLabel: "A", toLabel: "B", relationType: "supports" }],
      };

      db.insert(contextSnapshots)
        .values({ id: "snap-1", discoveryId: "d-1", stage: "DISCOVERY", snapshotData: data })
        .run();
      db.insert(contextSnapshots)
        .values({ id: "snap-2", discoveryId: "d-1", stage: "HYPOTHESIS", snapshotData: data })
        .run();

      const diff = await compareSnapshots(asDB(db), "d-1", "DISCOVERY", "HYPOTHESIS");

      expect(diff.addedNodes).toHaveLength(0);
      expect(diff.removedNodes).toHaveLength(0);
      expect(diff.addedEdges).toHaveLength(0);
      expect(diff.removedEdges).toHaveLength(0);
      expect(diff.summary).toBe("no changes");
    });

    it("스냅샷이 없는 단계 → 빈 배열 기준 비교", async () => {
      insertDiscovery(db, "d-1");

      db.insert(contextSnapshots)
        .values({
          id: "snap-1",
          discoveryId: "d-1",
          stage: "HYPOTHESIS",
          snapshotData: {
            nodes: [{ id: "n1", label: "A" }],
            edges: [],
          },
        })
        .run();

      // DISCOVERY 스냅샷 없음
      const diff = await compareSnapshots(asDB(db), "d-1", "DISCOVERY", "HYPOTHESIS");

      // 모든 것이 "추가"로 감지
      expect(diff.addedNodes).toHaveLength(1);
      expect(diff.removedNodes).toHaveLength(0);
    });
  });
});
