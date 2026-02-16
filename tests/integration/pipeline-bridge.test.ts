import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDB } from "../helpers/db";
import { users, discoveries, tenants } from "~/db/schema";
import {
  topics,
  topicMembers,
  graphs,
  sharedSignals,
} from "~/db/schema-v2";
import { PipelineBridge } from "~/lib/integration/pipeline-bridge";

describe("PipelineBridge", () => {
  let db: TestDB;
  let bridge: PipelineBridge;

  beforeEach(() => {
    db = createTestDb();
    bridge = new PipelineBridge(db as never);

    // ─── 시드 데이터 ─────────────────────────────────────────────────

    // users
    db.insert(users)
      .values([
        { id: "u1", email: "u1@test.com", name: "User 1", role: "user" },
        { id: "u2", email: "u2@test.com", name: "User 2", role: "user" },
      ])
      .run();

    // topics
    db.insert(topics)
      .values({
        id: "t1",
        teamId: "team1",
        name: "AI Research",
        createdBy: "u1",
      })
      .run();

    // topicMembers
    db.insert(topicMembers)
      .values([
        { topicId: "t1", userId: "u1", role: "owner" },
        { topicId: "t1", userId: "u2", role: "editor" },
      ])
      .run();

    // graphs (user scope — expertise score 계산용)
    db.insert(graphs)
      .values([
        {
          id: "g-u1",
          scopeType: "user",
          scopeId: "u1",
          jsonld: JSON.stringify({
            "@context": {},
            "@graph": [
              {
                "@id": "node:ai",
                "@type": "dx:Concept",
                "dx:label": "AI Research",
                "dx:importance": 0.8,
              },
              {
                "@id": "node:ml",
                "@type": "dx:Expertise",
                "dx:label": "Machine Learning",
                "dx:importance": 0.6,
              },
            ],
          }),
          contentHash: "hash1",
        },
        {
          id: "g-u2",
          scopeType: "user",
          scopeId: "u2",
          jsonld: JSON.stringify({
            "@context": {},
            "@graph": [
              {
                "@id": "node:market",
                "@type": "dx:Concept",
                "dx:label": "Market Analysis",
                "dx:importance": 0.5,
              },
            ],
          }),
          contentHash: "hash2",
        },
      ])
      .run();

    // sharedSignals
    db.insert(sharedSignals)
      .values([
        {
          sourceUserId: "u1",
          teamId: "team1",
          topicId: "t1",
          contentSummary: "AI breakthrough in LLM",
          score: 9.0,
          status: "pending",
        },
        {
          sourceUserId: "u2",
          teamId: "team1",
          topicId: "t1",
          contentSummary: "Market shift in SaaS",
          score: 7.5,
          status: "reviewed",
          routedTo: "u1",
        },
        {
          sourceUserId: "u1",
          teamId: "team1",
          topicId: "t1",
          contentSummary: "Low priority signal",
          score: 3.0,
          status: "dismissed",
        },
      ])
      .run();

    // discoveries
    db.insert(discoveries)
      .values({
        id: "d1",
        title: "LLM 상용화 기회 탐색",
        seedSummary: "LLM을 활용한 내부 프로세스 자동화",
        sourceType: "article",
        status: "HYPOTHESIS",
        ownerId: "u1",
      })
      .run();
  });

  // ─── getRelevantSignals (getTopSignals) ─────────────────────────────

  describe("getRelevantSignals", () => {
    it("사용자가 속한 Topic의 시그널을 score 내림차순으로 반환한다", async () => {
      const signals = await bridge.getRelevantSignals("u1");

      expect(signals.length).toBe(3);
      // score 내림차순 정렬 확인
      expect(signals[0].score).toBe(9.0);
      expect(signals[1].score).toBe(7.5);
      expect(signals[2].score).toBe(3.0);
    });

    it("limit 파라미터로 반환 개수를 제한한다", async () => {
      const signals = await bridge.getRelevantSignals("u1", 2);

      expect(signals.length).toBe(2);
      expect(signals[0].score).toBe(9.0);
    });

    it("Topic에 속하지 않은 사용자는 빈 배열을 반환한다", async () => {
      // u3은 topicMembers에 없음
      db.insert(users)
        .values({ id: "u3", email: "u3@test.com", name: "User 3" })
        .run();

      const signals = await bridge.getRelevantSignals("u3");
      expect(signals).toHaveLength(0);
    });
  });

  // ─── getExpertiseScore ──────────────────────────────────────────────

  describe("getExpertiseScore", () => {
    it("Graph에 domain 관련 노드가 있으면 점수를 반환한다", async () => {
      const score = await bridge.getExpertiseScore("u1", "AI");

      // u1 Graph에 "AI Research" 노드가 있으므로 > 0
      expect(score).toBeGreaterThan(0);
    });

    it("domain과 무관한 노드만 있으면 0을 반환한다", async () => {
      const score = await bridge.getExpertiseScore("u2", "Blockchain");

      expect(score).toBe(0);
    });

    it("Graph가 없는 사용자는 0을 반환한다", async () => {
      db.insert(users)
        .values({ id: "u3", email: "u3@test.com", name: "User 3" })
        .run();

      const score = await bridge.getExpertiseScore("u3", "AI");
      expect(score).toBe(0);
    });

    it("여러 관련 노드가 있으면 더 높은 점수를 반환한다", async () => {
      // u1은 AI 관련 노드 1개 (AI Research), u1에 추가 노드 삽입
      const scoreOneNode = await bridge.getExpertiseScore("u1", "AI");

      // u1의 Graph에 AI 관련 노드를 추가
      db.update(graphs)
        .set({
          jsonld: JSON.stringify({
            "@context": {},
            "@graph": [
              {
                "@id": "node:ai",
                "@type": "dx:Concept",
                "dx:label": "AI Research",
                "dx:importance": 0.8,
              },
              {
                "@id": "node:ai-ethics",
                "@type": "dx:Concept",
                "dx:label": "AI Ethics",
                "dx:importance": 0.7,
              },
              {
                "@id": "node:ai-ops",
                "@type": "dx:Concept",
                "dx:label": "AI Operations",
                "dx:importance": 0.9,
              },
            ],
          }),
        })
        .run();

      const scoreMultiNode = await bridge.getExpertiseScore("u1", "AI");

      // 노드 수가 많을수록 countFactor가 높아져 점수 상승
      expect(scoreMultiNode).toBeGreaterThan(scoreOneNode);
    });
  });

  // ─── getOpportunityStatus ──────────────────────────────────────────

  describe("getOpportunityStatus", () => {
    it("Discovery의 상태를 반환한다", async () => {
      const status = await bridge.getOpportunityStatus("d1");

      expect(status).not.toBeNull();
      expect(status!.id).toBe("d1");
      expect(status!.title).toBe("LLM 상용화 기회 탐색");
      expect(status!.status).toBe("HYPOTHESIS");
      expect(status!.ownerId).toBe("u1");
    });

    it("존재하지 않는 Discovery는 null을 반환한다", async () => {
      const status = await bridge.getOpportunityStatus("nonexistent");
      expect(status).toBeNull();
    });
  });

  // ─── submitIdea ────────────────────────────────────────────────────

  describe("submitIdea", () => {
    it("아이디어를 생성하고 결과를 반환한다", async () => {
      // ideas 테이블에는 tenantId FK 필요 → tenants 시드 추가
      db.insert(tenants)
        .values({
          id: "tenant1",
          name: "Test Tenant",
          slug: "test-tenant",
          ownerUserId: "u1",
        })
        .run();

      const result = await bridge.submitIdea("u1", {
        title: "LLM 자동화 아이디어",
        tenantId: "tenant1",
      });

      expect(result.id).toBeDefined();
      expect(result.createdAt).toBeInstanceOf(Date);
    });
  });

  // ─── annotateSignal ────────────────────────────────────────────────

  describe("annotateSignal", () => {
    it("시그널에 주석을 추가한다", async () => {
      // 기존 시그널 ID 조회 (autoIncrement이므로 1부터)
      await bridge.annotateSignal(1, "중요: 후속 조사 필요");

      // 직접 DB 조회하여 확인
      const signal = await db
        .select({ contentSummary: sharedSignals.contentSummary })
        .from(sharedSignals)
        .where(eq(sharedSignals.id, 1))
        .get();

      expect(signal?.contentSummary).toContain("[주석] 중요: 후속 조사 필요");
    });

    it("존재하지 않는 시그널에 주석 추가 시 에러를 던진다", async () => {
      await expect(
        bridge.annotateSignal(999, "test"),
      ).rejects.toThrow("시그널을 찾을 수 없습니다");
    });
  });
});
