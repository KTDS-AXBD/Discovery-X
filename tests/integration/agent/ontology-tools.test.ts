import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDB } from "../../helpers/db";
import {
  makeUser,
  makeDiscovery,
  makeEvidence,
  makeContextNode,
  makeContextEdge,
  resetFixtureCounter,
} from "../../helpers/fixtures";
import {
  discoveries,
  users,
  evidence,
  contextNodes,
  contextEdges,
  evidenceDuplicateCandidates,
} from "~/db/schema";
import {
  extractEntities,
  linkEntities,
  queryGraph,
  getDuplicateQueue,
  reviewDuplicate,
} from "~/lib/agent/tools/ontology-tools";

function asDB(db: TestDB) {
  return db as unknown as Parameters<typeof extractEntities>[0];
}

describe("Agent ontology-tools", () => {
  let db: TestDB;

  beforeEach(() => {
    resetFixtureCounter();
    db = createTestDb();
  });

  // ─── extractEntities ─────────────────────────────────────────────

  describe("extractEntities", () => {
    it("정상 생성: Discovery + ontologyType 존재 시 context_nodes 생성", async () => {
      const disc = makeDiscovery({ id: "disc-1" });
      db.insert(discoveries).values(disc).run();

      const result = JSON.parse(
        await extractEntities(asDB(db), {
          discoveryId: "disc-1",
          entities: [
            { label: "AI 기술", ontologyTypeId: "ONT-01" },
          ],
        })
      );

      expect(result.success).toBe(true);
      expect(result.nodesCreated).toBe(1);
      expect(result.nodes[0].label).toBe("AI 기술");
      expect(result.nodes[0].ontologyTypeId).toBe("ONT-01");

      const rows = db.select().from(contextNodes).all();
      expect(rows).toHaveLength(1);
      expect(rows[0].discoveryId).toBe("disc-1");
    });

    it("다중 엔티티: 배열 3개 → 3개 노드 생성", async () => {
      const disc = makeDiscovery({ id: "disc-1" });
      db.insert(discoveries).values(disc).run();

      const result = JSON.parse(
        await extractEntities(asDB(db), {
          discoveryId: "disc-1",
          entities: [
            { label: "엔티티A", ontologyTypeId: "ONT-01" },
            { label: "엔티티B", ontologyTypeId: "ONT-02" },
            { label: "엔티티C", ontologyTypeId: "ONT-03" },
          ],
        })
      );

      expect(result.nodesCreated).toBe(3);
      expect(result.nodes).toHaveLength(3);

      const rows = db.select().from(contextNodes).all();
      expect(rows).toHaveLength(3);
    });

    it("Discovery 없음: 에러 반환", async () => {
      const result = JSON.parse(
        await extractEntities(asDB(db), {
          discoveryId: "non-existent",
          entities: [{ label: "Test", ontologyTypeId: "ONT-01" }],
        })
      );

      expect(result.error).toBeTruthy();
      expect(result.error).toContain("non-existent");
    });

    it("빈 entities 배열: 에러 반환", async () => {
      const disc = makeDiscovery({ id: "disc-1" });
      db.insert(discoveries).values(disc).run();

      const result = JSON.parse(
        await extractEntities(asDB(db), {
          discoveryId: "disc-1",
          entities: [],
        })
      );

      expect(result.error).toBeTruthy();
    });

    it("존재하지 않는 ontologyTypeId: 해당 엔티티 스킵", async () => {
      const disc = makeDiscovery({ id: "disc-1" });
      db.insert(discoveries).values(disc).run();

      const result = JSON.parse(
        await extractEntities(asDB(db), {
          discoveryId: "disc-1",
          entities: [
            { label: "유효", ontologyTypeId: "ONT-01" },
            { label: "무효", ontologyTypeId: "ONT-INVALID" },
          ],
        })
      );

      expect(result.success).toBe(true);
      expect(result.nodesCreated).toBe(1);
      expect(result.nodes[0].label).toBe("유효");
    });
  });

  // ─── linkEntities ────────────────────────────────────────────────

  describe("linkEntities", () => {
    it("정상 연결: 동일 Discovery 노드 2개 → edge 생성", async () => {
      const disc = makeDiscovery({ id: "disc-1" });
      db.insert(discoveries).values(disc).run();

      const node1 = makeContextNode({ id: "node-1", discoveryId: "disc-1", label: "A" });
      const node2 = makeContextNode({ id: "node-2", discoveryId: "disc-1", label: "B" });
      db.insert(contextNodes).values(node1).run();
      db.insert(contextNodes).values(node2).run();

      const result = JSON.parse(
        await linkEntities(asDB(db), {
          discoveryId: "disc-1",
          fromNodeId: "node-1",
          toNodeId: "node-2",
          relationType: "supports",
        })
      );

      expect(result.success).toBe(true);
      expect(result.from).toBe("A");
      expect(result.to).toBe("B");
      expect(result.relationType).toBe("supports");
      expect(result.strength).toBe(1); // 기본값 100/100

      const edges = db.select().from(contextEdges).all();
      expect(edges).toHaveLength(1);
    });

    it("strength 정규화: 입력 0.7 → DB 70 → 출력 0.7", async () => {
      const disc = makeDiscovery({ id: "disc-1" });
      db.insert(discoveries).values(disc).run();

      const node1 = makeContextNode({ id: "node-1", discoveryId: "disc-1" });
      const node2 = makeContextNode({ id: "node-2", discoveryId: "disc-1" });
      db.insert(contextNodes).values(node1).run();
      db.insert(contextNodes).values(node2).run();

      const result = JSON.parse(
        await linkEntities(asDB(db), {
          discoveryId: "disc-1",
          fromNodeId: "node-1",
          toNodeId: "node-2",
          relationType: "causes",
          strength: 0.7,
        })
      );

      expect(result.strength).toBe(0.7);

      const edge = db.select().from(contextEdges).all()[0];
      expect(edge.strength).toBe(70);
    });

    it("노드 없음: fromNodeId 존재하지 않으면 에러", async () => {
      const result = JSON.parse(
        await linkEntities(asDB(db), {
          discoveryId: "disc-1",
          fromNodeId: "non-existent",
          toNodeId: "non-existent-2",
          relationType: "supports",
        })
      );

      expect(result.error).toBeTruthy();
      expect(result.error).toContain("노드");
    });

    it("Discovery 불일치: 서로 다른 Discovery 노드 → 에러", async () => {
      const disc1 = makeDiscovery({ id: "disc-1" });
      const disc2 = makeDiscovery({ id: "disc-2" });
      db.insert(discoveries).values(disc1).run();
      db.insert(discoveries).values(disc2).run();

      const node1 = makeContextNode({ id: "node-1", discoveryId: "disc-1" });
      const node2 = makeContextNode({ id: "node-2", discoveryId: "disc-2" });
      db.insert(contextNodes).values(node1).run();
      db.insert(contextNodes).values(node2).run();

      const result = JSON.parse(
        await linkEntities(asDB(db), {
          discoveryId: "disc-1",
          fromNodeId: "node-1",
          toNodeId: "node-2",
          relationType: "supports",
        })
      );

      expect(result.error).toBeTruthy();
      expect(result.error).toContain("동일 Discovery");
    });

    it("유효하지 않은 relationType: 에러 반환", async () => {
      const disc = makeDiscovery({ id: "disc-1" });
      db.insert(discoveries).values(disc).run();

      const node1 = makeContextNode({ id: "node-1", discoveryId: "disc-1" });
      const node2 = makeContextNode({ id: "node-2", discoveryId: "disc-1" });
      db.insert(contextNodes).values(node1).run();
      db.insert(contextNodes).values(node2).run();

      const result = JSON.parse(
        await linkEntities(asDB(db), {
          discoveryId: "disc-1",
          fromNodeId: "node-1",
          toNodeId: "node-2",
          relationType: "invalid_type",
        })
      );

      expect(result.error).toBeTruthy();
      expect(result.error).toContain("유효하지 않은 관계 타입");
    });
  });

  // ─── queryGraph ──────────────────────────────────────────────────

  describe("queryGraph", () => {
    it("전체 조회: 노드 3개 + 엣지 2개 → nodes/edges/stats 반환", async () => {
      const disc = makeDiscovery({ id: "disc-1" });
      db.insert(discoveries).values(disc).run();

      const n1 = makeContextNode({ id: "n1", discoveryId: "disc-1", ontologyTypeId: "ONT-01" });
      const n2 = makeContextNode({ id: "n2", discoveryId: "disc-1", ontologyTypeId: "ONT-02" });
      const n3 = makeContextNode({ id: "n3", discoveryId: "disc-1", ontologyTypeId: "ONT-01" });
      db.insert(contextNodes).values(n1).run();
      db.insert(contextNodes).values(n2).run();
      db.insert(contextNodes).values(n3).run();

      const e1 = makeContextEdge({ id: "e1", fromNodeId: "n1", toNodeId: "n2" });
      const e2 = makeContextEdge({ id: "e2", fromNodeId: "n2", toNodeId: "n3" });
      db.insert(contextEdges).values(e1).run();
      db.insert(contextEdges).values(e2).run();

      const result = JSON.parse(
        await queryGraph(asDB(db), { discoveryId: "disc-1" })
      );

      expect(result.nodes).toHaveLength(3);
      expect(result.edges).toHaveLength(2);
      expect(result.stats.nodeCount).toBe(3);
      expect(result.stats.edgeCount).toBe(2);
      expect(result.stats.connectedComponents).toBe(1);
    });

    it("ontologyType 필터: 특정 타입만 필터링", async () => {
      const disc = makeDiscovery({ id: "disc-1" });
      db.insert(discoveries).values(disc).run();

      const n1 = makeContextNode({ id: "n1", discoveryId: "disc-1", ontologyTypeId: "ONT-01" });
      const n2 = makeContextNode({ id: "n2", discoveryId: "disc-1", ontologyTypeId: "ONT-02" });
      const n3 = makeContextNode({ id: "n3", discoveryId: "disc-1", ontologyTypeId: "ONT-01" });
      db.insert(contextNodes).values(n1).run();
      db.insert(contextNodes).values(n2).run();
      db.insert(contextNodes).values(n3).run();

      const result = JSON.parse(
        await queryGraph(asDB(db), { discoveryId: "disc-1", ontologyTypeId: "ONT-01" })
      );

      expect(result.nodes).toHaveLength(2);
      expect(result.nodes.every((n: { ontologyTypeId: string }) => n.ontologyTypeId === "ONT-01")).toBe(true);
    });

    it("빈 그래프: 노드 없으면 빈 배열 + stats 0", async () => {
      const disc = makeDiscovery({ id: "disc-1" });
      db.insert(discoveries).values(disc).run();

      const result = JSON.parse(
        await queryGraph(asDB(db), { discoveryId: "disc-1" })
      );

      expect(result.nodes).toHaveLength(0);
      expect(result.edges).toHaveLength(0);
      expect(result.stats.nodeCount).toBe(0);
      expect(result.stats.edgeCount).toBe(0);
      expect(result.stats.connectedComponents).toBe(0);
    });

    it("연결 요소 계산: 3노드 2엣지(1연결+1독립) → connectedComponents=2", async () => {
      const disc = makeDiscovery({ id: "disc-1" });
      db.insert(discoveries).values(disc).run();

      // n1-n2 연결, n3 독립
      const n1 = makeContextNode({ id: "n1", discoveryId: "disc-1", ontologyTypeId: "ONT-01" });
      const n2 = makeContextNode({ id: "n2", discoveryId: "disc-1", ontologyTypeId: "ONT-01" });
      const n3 = makeContextNode({ id: "n3", discoveryId: "disc-1", ontologyTypeId: "ONT-01" });
      db.insert(contextNodes).values(n1).run();
      db.insert(contextNodes).values(n2).run();
      db.insert(contextNodes).values(n3).run();

      const e1 = makeContextEdge({ id: "e1", fromNodeId: "n1", toNodeId: "n2" });
      db.insert(contextEdges).values(e1).run();

      const result = JSON.parse(
        await queryGraph(asDB(db), { discoveryId: "disc-1" })
      );

      expect(result.stats.nodeCount).toBe(3);
      expect(result.stats.edgeCount).toBe(1);
      expect(result.stats.connectedComponents).toBe(2);
    });
  });

  // ─── getDuplicateQueue ───────────────────────────────────────────

  describe("getDuplicateQueue", () => {
    function seedDuplicateData() {
      const user = makeUser({ id: "user-1" });
      db.insert(users).values(user).run();

      const disc = makeDiscovery({ id: "disc-1" });
      db.insert(discoveries).values(disc).run();

      const ev1 = makeEvidence({ id: "ev-1", discoveryId: "disc-1", createdById: "user-1", content: "Evidence content 1" });
      const ev2 = makeEvidence({ id: "ev-2", discoveryId: "disc-1", createdById: "user-1", content: "Evidence content 2" });
      const ev3 = makeEvidence({ id: "ev-3", discoveryId: "disc-1", createdById: "user-1", content: "Evidence content 3" });
      db.insert(evidence).values(ev1).run();
      db.insert(evidence).values(ev2).run();
      db.insert(evidence).values(ev3).run();

      return { user, disc, ev1, ev2, ev3 };
    }

    it("정상 조회: reviewed=0 항목만 반환, similarityScore DESC 정렬", async () => {
      seedDuplicateData();

      // 미검토 2건 (점수 다름) + 검토 완료 1건
      db.insert(evidenceDuplicateCandidates).values({
        id: "dup-1",
        evidenceId1: "ev-1",
        evidenceId2: "ev-2",
        similarityScore: 80,
        reason: "유사한 내용",
        reviewed: 0,
      }).run();

      db.insert(evidenceDuplicateCandidates).values({
        id: "dup-2",
        evidenceId1: "ev-2",
        evidenceId2: "ev-3",
        similarityScore: 95,
        reason: "매우 유사",
        reviewed: 0,
      }).run();

      db.insert(evidenceDuplicateCandidates).values({
        id: "dup-3",
        evidenceId1: "ev-1",
        evidenceId2: "ev-3",
        similarityScore: 60,
        reason: "약간 유사",
        reviewed: 1, // 이미 검토됨
      }).run();

      const result = JSON.parse(
        await getDuplicateQueue(asDB(db), {})
      );

      expect(result.total).toBe(2);
      expect(result.candidates).toHaveLength(2);
      // DESC 정렬: 95점이 먼저
      expect(result.candidates[0].id).toBe("dup-2");
      expect(result.candidates[0].similarityScore).toBe(0.95);
      expect(result.candidates[1].id).toBe("dup-1");
      expect(result.candidates[1].similarityScore).toBe(0.8);
    });

    it("빈 큐: 미검토 항목 없으면 total=0", async () => {
      const result = JSON.parse(
        await getDuplicateQueue(asDB(db), {})
      );

      expect(result.total).toBe(0);
      expect(result.candidates).toHaveLength(0);
    });

    it("limit 적용: limit=1이면 1건만 반환", async () => {
      seedDuplicateData();

      db.insert(evidenceDuplicateCandidates).values({
        id: "dup-1",
        evidenceId1: "ev-1",
        evidenceId2: "ev-2",
        similarityScore: 80,
        reviewed: 0,
      }).run();

      db.insert(evidenceDuplicateCandidates).values({
        id: "dup-2",
        evidenceId1: "ev-2",
        evidenceId2: "ev-3",
        similarityScore: 95,
        reviewed: 0,
      }).run();

      const result = JSON.parse(
        await getDuplicateQueue(asDB(db), { limit: 1 })
      );

      expect(result.total).toBe(1);
      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0].id).toBe("dup-2"); // 높은 점수 우선
    });
  });

  // ─── reviewDuplicate ─────────────────────────────────────────────

  describe("reviewDuplicate", () => {
    function seedReviewData() {
      const user = makeUser({ id: "user-1" });
      db.insert(users).values(user).run();

      const disc = makeDiscovery({ id: "disc-1" });
      db.insert(discoveries).values(disc).run();

      const ev1 = makeEvidence({ id: "ev-1", discoveryId: "disc-1", createdById: "user-1", content: "Content A" });
      const ev2 = makeEvidence({ id: "ev-2", discoveryId: "disc-1", createdById: "user-1", content: "Content B" });
      db.insert(evidence).values(ev1).run();
      db.insert(evidence).values(ev2).run();

      db.insert(evidenceDuplicateCandidates).values({
        id: "dup-1",
        evidenceId1: "ev-1",
        evidenceId2: "ev-2",
        similarityScore: 85,
        reviewed: 0,
      }).run();

      return { ev1, ev2 };
    }

    it("ignore 결정: reviewed=2 업데이트", async () => {
      seedReviewData();

      const result = JSON.parse(
        await reviewDuplicate(asDB(db), {
          candidateId: "dup-1",
          decision: "ignore",
        })
      );

      expect(result.success).toBe(true);
      expect(result.decision).toBe("ignore");
      expect(result.reviewedStatus).toBe(2);

      const row = db
        .select()
        .from(evidenceDuplicateCandidates)
        .where(eq(evidenceDuplicateCandidates.id, "dup-1"))
        .all()[0];
      expect(row.reviewed).toBe(2);
    });

    it("merge 결정: content 병합 + reviewed=1", async () => {
      seedReviewData();

      const result = JSON.parse(
        await reviewDuplicate(asDB(db), {
          candidateId: "dup-1",
          decision: "merge",
          mergeTargetId: "ev-1",
        })
      );

      expect(result.success).toBe(true);
      expect(result.decision).toBe("merge");
      expect(result.reviewedStatus).toBe(1);

      // ev-1에 ev-2 content가 병합됨
      const targetEv = db
        .select()
        .from(evidence)
        .where(eq(evidence.id, "ev-1"))
        .all()[0];
      expect(targetEv.content).toContain("Content A");
      expect(targetEv.content).toContain("[병합됨]");
      expect(targetEv.content).toContain("Content B");
      // 400자 제한
      expect(targetEv.content.length).toBeLessThanOrEqual(400);
    });

    it("candidate 없음: 에러", async () => {
      const result = JSON.parse(
        await reviewDuplicate(asDB(db), {
          candidateId: "non-existent",
          decision: "ignore",
        })
      );

      expect(result.error).toBeTruthy();
      expect(result.error).toContain("찾을 수 없습니다");
    });

    it("이미 검토됨: reviewed!=0이면 에러", async () => {
      const user = makeUser({ id: "user-1" });
      db.insert(users).values(user).run();

      const disc = makeDiscovery({ id: "disc-1" });
      db.insert(discoveries).values(disc).run();

      const ev1 = makeEvidence({ id: "ev-1", discoveryId: "disc-1", createdById: "user-1" });
      const ev2 = makeEvidence({ id: "ev-2", discoveryId: "disc-1", createdById: "user-1" });
      db.insert(evidence).values(ev1).run();
      db.insert(evidence).values(ev2).run();

      db.insert(evidenceDuplicateCandidates).values({
        id: "dup-reviewed",
        evidenceId1: "ev-1",
        evidenceId2: "ev-2",
        similarityScore: 85,
        reviewed: 2, // 이미 검토됨
      }).run();

      const result = JSON.parse(
        await reviewDuplicate(asDB(db), {
          candidateId: "dup-reviewed",
          decision: "merge",
          mergeTargetId: "ev-1",
        })
      );

      expect(result.error).toBeTruthy();
      expect(result.error).toContain("이미 검토");
    });
  });
});
