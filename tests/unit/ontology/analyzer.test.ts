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
  ontologyTypes,
  tenants,
  tenantMembers,
  users,
} from "~/db/schema";
import {
  detectPatterns,
  detectContradictions,
  detectClusters,
  analyzeCentrality,
} from "~/lib/ontology/analyzer";

/** TestDB → DrizzleD1Database 호환 타입 캐스팅 */
function asDB(db: TestDB) {
  return db as unknown as Parameters<typeof detectPatterns>[0];
}

/** 테스트용 공통 시드 데이터 삽입 */
function seedBase(db: TestDB) {
  // ontologyTypes
  db.insert(ontologyTypes)
    .values([
      { id: "ot-market", nameKo: "시장", domain: "market", color: "#111" },
      { id: "ot-customer", nameKo: "고객", domain: "market", color: "#222" },
      { id: "ot-risk", nameKo: "리스크", domain: "strategy", color: "#333" },
      { id: "ot-tech", nameKo: "기술", domain: "tech", color: "#444" },
    ])
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
  relationType = "relates_to",
  strength = 100,
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

describe("ontology/analyzer", () => {
  let db: TestDB;

  beforeEach(() => {
    resetFixtureCounter();
    db = createTestDb();
    seedBase(db);
  });

  // ====================================================================
  // 1. detectPatterns
  // ====================================================================
  describe("detectPatterns", () => {
    it("엣지 0개 → 빈 배열", async () => {
      insertDiscovery(db, "d-1");
      const result = await detectPatterns(asDB(db), "t-1");
      expect(result).toEqual([]);
    });

    it("2-hop 패턴: 같은 타입 경로가 2회 이상 반복 시 감지", async () => {
      insertDiscovery(db, "d-1");
      // A1(market)→B1(customer), A2(market)→B2(customer) — 같은 2-hop 패턴 2회
      insertNode(db, "n-a1", "d-1", "ot-market");
      insertNode(db, "n-b1", "d-1", "ot-customer");
      insertNode(db, "n-a2", "d-1", "ot-market");
      insertNode(db, "n-b2", "d-1", "ot-customer");
      insertEdge(db, "e-1", "n-a1", "n-b1", "supports");
      insertEdge(db, "e-2", "n-a2", "n-b2", "supports");

      const result = await detectPatterns(asDB(db), "t-1");
      expect(result.length).toBeGreaterThanOrEqual(1);
      const twoHop = result.find(
        (p) => p.path.length === 2 && p.path[0] === "ot-market" && p.path[1] === "ot-customer",
      );
      expect(twoHop).toBeDefined();
      expect(twoHop!.count).toBe(2);
    });

    it("3-hop 패턴: A→B→C 타입 경로가 2회 이상 반복 시 감지", async () => {
      insertDiscovery(db, "d-1");
      // 경로 1: market→customer→risk
      insertNode(db, "n-m1", "d-1", "ot-market");
      insertNode(db, "n-c1", "d-1", "ot-customer");
      insertNode(db, "n-r1", "d-1", "ot-risk");
      insertEdge(db, "e-1", "n-m1", "n-c1");
      insertEdge(db, "e-2", "n-c1", "n-r1");

      // 경로 2: market→customer→risk (다른 노드)
      insertNode(db, "n-m2", "d-1", "ot-market");
      insertNode(db, "n-c2", "d-1", "ot-customer");
      insertNode(db, "n-r2", "d-1", "ot-risk");
      insertEdge(db, "e-3", "n-m2", "n-c2");
      insertEdge(db, "e-4", "n-c2", "n-r2");

      const result = await detectPatterns(asDB(db), "t-1");
      const threeHop = result.find(
        (p) =>
          p.path.length === 3 &&
          p.path[0] === "ot-market" &&
          p.path[1] === "ot-customer" &&
          p.path[2] === "ot-risk",
      );
      expect(threeHop).toBeDefined();
      expect(threeHop!.count).toBe(2);
    });

    it("빈도 1인 경로는 제외", async () => {
      insertDiscovery(db, "d-1");
      // 1회만 등장하는 경로
      insertNode(db, "n-a", "d-1", "ot-market");
      insertNode(db, "n-b", "d-1", "ot-tech");
      insertEdge(db, "e-1", "n-a", "n-b");

      const result = await detectPatterns(asDB(db), "t-1");
      expect(result).toEqual([]);
    });

    it("reviewed=2 (거절된) 노드의 엣지는 제외", async () => {
      insertDiscovery(db, "d-1");
      // 정상 노드 쌍 1회
      insertNode(db, "n-a1", "d-1", "ot-market");
      insertNode(db, "n-b1", "d-1", "ot-customer");
      insertEdge(db, "e-1", "n-a1", "n-b1");
      // 거절된 노드 쌍 — 이것까지 합치면 2회가 되지만, reviewed=2이므로 제외
      insertNode(db, "n-a2", "d-1", "ot-market", { reviewed: 2 });
      insertNode(db, "n-b2", "d-1", "ot-customer");
      insertEdge(db, "e-2", "n-a2", "n-b2");

      const result = await detectPatterns(asDB(db), "t-1");
      // n-a2가 제외되므로 e-2도 제외 → 패턴 빈도 1 → 빈 결과
      expect(result).toEqual([]);
    });
  });

  // ====================================================================
  // 2. detectContradictions
  // ====================================================================
  describe("detectContradictions", () => {
    it("모순 없음 → 빈 배열", async () => {
      insertDiscovery(db, "d-1");
      insertNode(db, "n-a", "d-1", "ot-market");
      insertNode(db, "n-b", "d-1", "ot-customer");
      insertEdge(db, "e-1", "n-a", "n-b", "supports");

      const result = await detectContradictions(asDB(db), "t-1");
      expect(result).toEqual([]);
    });

    it("같은 쌍에 supports + contradicts → 모순 감지", async () => {
      insertDiscovery(db, "d-1");
      insertNode(db, "n-a", "d-1", "ot-market");
      insertNode(db, "n-b", "d-1", "ot-customer");
      insertEdge(db, "e-1", "n-a", "n-b", "supports", 80);
      insertEdge(db, "e-2", "n-a", "n-b", "contradicts", 70);

      const result = await detectContradictions(asDB(db), "t-1");
      expect(result).toHaveLength(1);
      expect(result[0].supportEdges).toHaveLength(1);
      expect(result[0].contradictEdges).toHaveLength(1);
    });

    it("다른 쌍에 supports + contradicts → 모순 아님", async () => {
      insertDiscovery(db, "d-1");
      insertNode(db, "n-a", "d-1", "ot-market");
      insertNode(db, "n-b", "d-1", "ot-customer");
      insertNode(db, "n-c", "d-1", "ot-risk");
      // A→B supports, A→C contradicts — 다른 쌍
      insertEdge(db, "e-1", "n-a", "n-b", "supports");
      insertEdge(db, "e-2", "n-a", "n-c", "contradicts");

      const result = await detectContradictions(asDB(db), "t-1");
      expect(result).toEqual([]);
    });

    it("globalEntityId가 같은 노드 간 모순도 감지", async () => {
      // 다른 discovery에 있지만 같은 globalEntityId를 가진 노드
      insertDiscovery(db, "d-1");
      insertDiscovery(db, "d-2");
      insertNode(db, "n-a1", "d-1", "ot-market", { globalEntityId: "ge-alpha" });
      insertNode(db, "n-b1", "d-1", "ot-customer", { globalEntityId: "ge-beta" });
      insertNode(db, "n-a2", "d-2", "ot-market", { globalEntityId: "ge-alpha" });
      insertNode(db, "n-b2", "d-2", "ot-customer", { globalEntityId: "ge-beta" });
      // d-1에서 supports, d-2에서 contradicts
      insertEdge(db, "e-1", "n-a1", "n-b1", "supports");
      insertEdge(db, "e-2", "n-a2", "n-b2", "contradicts");

      const result = await detectContradictions(asDB(db), "t-1");
      expect(result).toHaveLength(1);
      expect(result[0].supportEdges).toHaveLength(1);
      expect(result[0].contradictEdges).toHaveLength(1);
    });
  });

  // ====================================================================
  // 3. detectClusters
  // ====================================================================
  describe("detectClusters", () => {
    it("노드 없음 → 빈 배열", async () => {
      insertDiscovery(db, "d-1");
      const result = await detectClusters(asDB(db), "t-1");
      expect(result).toEqual([]);
    });

    it("3개 노드 연결 → 1개 클러스터", async () => {
      insertDiscovery(db, "d-1");
      insertNode(db, "n-a", "d-1", "ot-market");
      insertNode(db, "n-b", "d-1", "ot-customer");
      insertNode(db, "n-c", "d-1", "ot-risk");
      insertEdge(db, "e-1", "n-a", "n-b");
      insertEdge(db, "e-2", "n-b", "n-c");

      const result = await detectClusters(asDB(db), "t-1");
      expect(result).toHaveLength(1);
      expect(result[0].nodes).toHaveLength(3);
      expect(result[0].edgeCount).toBe(2);
    });

    it("분리된 2개 그룹 → 2개 클러스터", async () => {
      insertDiscovery(db, "d-1");
      // 그룹 1: n-a ↔ n-b
      insertNode(db, "n-a", "d-1", "ot-market");
      insertNode(db, "n-b", "d-1", "ot-customer");
      insertEdge(db, "e-1", "n-a", "n-b");
      // 그룹 2: n-c ↔ n-d (연결 없음)
      insertNode(db, "n-c", "d-1", "ot-risk");
      insertNode(db, "n-d", "d-1", "ot-tech");
      insertEdge(db, "e-2", "n-c", "n-d");

      const result = await detectClusters(asDB(db), "t-1");
      expect(result).toHaveLength(2);
      // 각 클러스터에 2개 노드
      expect(result.every((c) => c.nodes.length === 2)).toBe(true);
    });

    it("globalEntityId 머지: 다른 Discovery의 같은 globalEntityId 노드가 하나의 클러스터로", async () => {
      insertDiscovery(db, "d-1");
      insertDiscovery(db, "d-2");
      // d-1: n-a(ge-alpha) → n-b
      insertNode(db, "n-a", "d-1", "ot-market", { globalEntityId: "ge-alpha" });
      insertNode(db, "n-b", "d-1", "ot-customer");
      insertEdge(db, "e-1", "n-a", "n-b");
      // d-2: n-c(ge-alpha) → n-d — n-c는 ge-alpha이므로 n-a와 같은 클러스터
      insertNode(db, "n-c", "d-2", "ot-market", { globalEntityId: "ge-alpha" });
      insertNode(db, "n-d", "d-2", "ot-tech");
      insertEdge(db, "e-2", "n-c", "n-d");

      const result = await detectClusters(asDB(db), "t-1");
      // ge-alpha 머지 → 모든 노드가 하나의 클러스터
      expect(result).toHaveLength(1);
      expect(result[0].nodes).toHaveLength(4);
    });
  });

  // ====================================================================
  // 4. analyzeCentrality
  // ====================================================================
  describe("analyzeCentrality", () => {
    it("노드 없음 → 빈 배열", async () => {
      insertDiscovery(db, "d-1");
      const result = await analyzeCentrality(asDB(db), "t-1");
      expect(result).toEqual([]);
    });

    it("허브 노드 (여러 엣지) → 가장 높은 centrality", async () => {
      insertDiscovery(db, "d-1");
      // 허브: n-hub, 스포크: n-s1, n-s2, n-s3
      insertNode(db, "n-hub", "d-1", "ot-market");
      insertNode(db, "n-s1", "d-1", "ot-customer");
      insertNode(db, "n-s2", "d-1", "ot-risk");
      insertNode(db, "n-s3", "d-1", "ot-tech");
      // 허브에서 나가는 3개 엣지
      insertEdge(db, "e-1", "n-hub", "n-s1");
      insertEdge(db, "e-2", "n-hub", "n-s2");
      insertEdge(db, "e-3", "n-hub", "n-s3");

      const result = await analyzeCentrality(asDB(db), "t-1");
      expect(result.length).toBeGreaterThanOrEqual(1);
      // 허브가 가장 높은 totalDegree (outDegree=3)
      expect(result[0].globalEntityId).toBe("n-hub");
      expect(result[0].outDegree).toBe(3);
      expect(result[0].inDegree).toBe(0);
      expect(result[0].totalDegree).toBe(3);
      // ontologyType nameKo 반환 확인
      expect(result[0].ontologyType).toBe("시장");
    });

    it("top 20 제한 확인 (21개 노드 중 20개만 반환)", async () => {
      insertDiscovery(db, "d-1");
      // 21개 노드, 각각 1개 엣지씩 (hub→spoke)
      insertNode(db, "n-hub", "d-1", "ot-market");
      for (let i = 1; i <= 21; i++) {
        const spokeId = `n-spoke-${i}`;
        insertNode(db, spokeId, "d-1", "ot-customer");
        insertEdge(db, `e-${i}`, "n-hub", spokeId);
      }
      // 총 22개 노드 (hub + 21 spokes)

      const result = await analyzeCentrality(asDB(db), "t-1");
      expect(result).toHaveLength(20);
      // 허브가 1위
      expect(result[0].globalEntityId).toBe("n-hub");
      expect(result[0].totalDegree).toBe(21);
    });
  });
});
