/**
 * TopicGraphService 단위 테스트
 * 대상: app/lib/services/topic-graph.service.ts
 *
 * 메서드:
 * - addDecision(topicId, input, actorId) — Decision 노드 추가
 * - getDecisions(topicId) — dx:Decision 노드 목록 조회
 * - updateDecision(topicId, decisionId, input, actorId) — Decision 수정
 * - removeDecision(topicId, decisionId, actorId) — Decision 삭제
 * - addGlossaryTerm(topicId, input, actorId) — Glossary 노드 추가
 * - getGlossary(topicId) — dx:Glossary 노드 목록 조회
 * - updateGlossaryTerm(topicId, termId, input, actorId) — Glossary 수정
 * - removeGlossaryTerm(topicId, termId, actorId) — Glossary 삭제
 * - getGraphEvents(topicId, limit?) — 감사 이벤트 조회
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createTestDb } from "tests/helpers/db";
import type { DB } from "~/db";
import { TopicGraphService } from "~/lib/services/topic-graph.service";
import { users } from "~/db/schema";

let db: ReturnType<typeof createTestDb>;
let service: TopicGraphService;

const ACTOR_ID = "user-graph-actor";
const TOPIC_A = "topic-graph-a";
const TOPIC_B = "topic-graph-b";
const TOPIC_EMPTY = "topic-graph-empty";

beforeAll(() => {
  db = createTestDb();
  service = new TopicGraphService(db as unknown as DB);

  // 사용자 시드 (actorId 용)
  db.insert(users)
    .values([
      { id: ACTOR_ID, email: "graph-actor@test.com", name: "그래프 액터", role: "admin" },
    ])
    .run();
});

// ============================================================================
// 1. Decision CRUD
// ============================================================================

describe("TopicGraphService", () => {
  describe("Decision CRUD", () => {
    it("addDecision — Decision 노드 생성 + JSON-LD 구조 확인", async () => {
      const node = await service.addDecision(
        TOPIC_A,
        { summary: "API 우선 전략 결정", date: "2026-02-20", context: "팀 회의" },
        ACTOR_ID,
      );

      expect(node["@type"]).toBe("dx:Decision");
      expect(node["dx:summary"]).toBe("API 우선 전략 결정");
      expect(node["dx:date"]).toBe("2026-02-20");
      expect(node["dx:context"]).toBe("팀 회의");
      expect(node["@id"]).toContain(`dx:topic/${TOPIC_A}/decision/`);
    });

    it("addDecision — date 미지정 시 오늘 날짜 기본값", async () => {
      const node = await service.addDecision(
        TOPIC_A,
        { summary: "날짜 미지정 결정" },
        ACTOR_ID,
      );

      const today = new Date().toISOString().slice(0, 10);
      expect(node["dx:date"]).toBe(today);
    });

    it("addDecision — decidedBy 포함", async () => {
      const node = await service.addDecision(
        TOPIC_A,
        { summary: "누가 결정", decidedBy: "CTO" },
        ACTOR_ID,
      );

      expect(node["dx:decidedBy"]).toBe("CTO");
    });

    it("getDecisions — Decision 노드만 필터 반환", async () => {
      const decisions = await service.getDecisions(TOPIC_A);

      expect(decisions.length).toBeGreaterThanOrEqual(3);
      expect(decisions.every((n) => n["@type"] === "dx:Decision")).toBe(true);
    });

    it("getDecisions — Graph가 없는 Topic은 빈 배열", async () => {
      const decisions = await service.getDecisions(TOPIC_EMPTY);
      expect(decisions).toEqual([]);
    });

    it("updateDecision — summary/date 수정", async () => {
      // 수정용 Decision 추가
      const original = await service.addDecision(
        TOPIC_B,
        { summary: "원본 결정", date: "2026-01-01" },
        ACTOR_ID,
      );

      const updated = await service.updateDecision(
        TOPIC_B,
        original["@id"] as string,
        { summary: "수정된 결정", date: "2026-03-01" },
        ACTOR_ID,
      );

      expect(updated["dx:summary"]).toBe("수정된 결정");
      expect(updated["dx:date"]).toBe("2026-03-01");
    });

    it("updateDecision — 존재하지 않는 decisionId → Error throw", async () => {
      await expect(
        service.updateDecision(TOPIC_B, "non-existent-id", { summary: "실패" }, ACTOR_ID),
      ).rejects.toThrow("찾을 수 없습니다");
    });

    it("removeDecision — Decision 노드 삭제", async () => {
      const node = await service.addDecision(
        TOPIC_B,
        { summary: "삭제 대상" },
        ACTOR_ID,
      );

      await service.removeDecision(TOPIC_B, node["@id"] as string, ACTOR_ID);

      const decisions = await service.getDecisions(TOPIC_B);
      const found = decisions.find((d) => d["@id"] === node["@id"]);
      expect(found).toBeUndefined();
    });

    it("removeDecision — 존재하지 않는 decisionId → Error throw", async () => {
      await expect(
        service.removeDecision(TOPIC_B, "non-existent-id", ACTOR_ID),
      ).rejects.toThrow("찾을 수 없습니다");
    });
  });

  // ============================================================================
  // 2. Glossary CRUD
  // ============================================================================

  describe("Glossary CRUD", () => {
    it("addGlossaryTerm — Glossary 노드 생성 + JSON-LD 구조 확인", async () => {
      const node = await service.addGlossaryTerm(
        TOPIC_A,
        { term: "Discovery", definition: "관찰에서 시작되는 탐색 단위" },
        ACTOR_ID,
      );

      expect(node["@type"]).toBe("dx:Glossary");
      expect(node["dx:term"]).toBe("Discovery");
      expect(node["dx:definition"]).toBe("관찰에서 시작되는 탐색 단위");
      expect(node["@id"]).toContain(`dx:topic/${TOPIC_A}/glossary/`);
    });

    it("getGlossary — Glossary 노드만 필터 반환", async () => {
      const glossary = await service.getGlossary(TOPIC_A);

      expect(glossary.length).toBeGreaterThanOrEqual(1);
      expect(glossary.every((n) => n["@type"] === "dx:Glossary")).toBe(true);
    });

    it("getGlossary — Graph가 없는 Topic은 빈 배열", async () => {
      const glossary = await service.getGlossary(TOPIC_EMPTY);
      expect(glossary).toEqual([]);
    });

    it("updateGlossaryTerm — term/definition 수정", async () => {
      const original = await service.addGlossaryTerm(
        TOPIC_B,
        { term: "원본 용어", definition: "원본 정의" },
        ACTOR_ID,
      );

      const updated = await service.updateGlossaryTerm(
        TOPIC_B,
        original["@id"] as string,
        { term: "수정 용어", definition: "수정 정의" },
        ACTOR_ID,
      );

      expect(updated["dx:term"]).toBe("수정 용어");
      expect(updated["dx:definition"]).toBe("수정 정의");
    });

    it("updateGlossaryTerm — 존재하지 않는 termId → Error throw", async () => {
      await expect(
        service.updateGlossaryTerm(
          TOPIC_B,
          "non-existent-id",
          { term: "실패" },
          ACTOR_ID,
        ),
      ).rejects.toThrow("찾을 수 없습니다");
    });

    it("removeGlossaryTerm — Glossary 노드 삭제", async () => {
      const node = await service.addGlossaryTerm(
        TOPIC_B,
        { term: "삭제 용어", definition: "삭제 정의" },
        ACTOR_ID,
      );

      await service.removeGlossaryTerm(TOPIC_B, node["@id"] as string, ACTOR_ID);

      const glossary = await service.getGlossary(TOPIC_B);
      const found = glossary.find((g) => g["@id"] === node["@id"]);
      expect(found).toBeUndefined();
    });

    it("removeGlossaryTerm — 존재하지 않는 termId → Error throw", async () => {
      await expect(
        service.removeGlossaryTerm(TOPIC_B, "non-existent-id", ACTOR_ID),
      ).rejects.toThrow("찾을 수 없습니다");
    });
  });

  // ============================================================================
  // 3. Graph Events (감사 로그)
  // ============================================================================

  describe("getGraphEvents", () => {
    it("Topic의 Graph 이벤트 반환 (create + update 포함)", async () => {
      const events = await service.getGraphEvents(TOPIC_A);

      // TOPIC_A에는 create + 여러 update 이벤트가 있어야 함
      expect(events.length).toBeGreaterThanOrEqual(2);
      expect(events[0].graphId).toBeDefined();
      expect(events[0].actorId).toBeDefined();
      expect(events[0].action).toBeDefined();
    });

    it("limit 옵션 — 결과 수 제한", async () => {
      const events = await service.getGraphEvents(TOPIC_A, 2);
      expect(events.length).toBeLessThanOrEqual(2);
    });

    it("Graph가 없는 Topic — 빈 배열", async () => {
      const events = await service.getGraphEvents(TOPIC_EMPTY);
      expect(events).toEqual([]);
    });
  });

  // ============================================================================
  // 4. getOrCreateTopicGraph (간접 검증)
  // ============================================================================

  describe("getOrCreateTopicGraph (간접 검증)", () => {
    it("첫 호출 시 Graph 자동 생성 + 두 번째 호출에서 기존 재사용", async () => {
      const freshTopic = "topic-graph-auto-create";

      // 첫 호출 — Graph가 없으므로 자동 생성
      const node1 = await service.addDecision(
        freshTopic,
        { summary: "첫 결정" },
        ACTOR_ID,
      );
      expect(node1).toBeDefined();

      // 두 번째 호출 — 기존 Graph에 추가
      const node2 = await service.addDecision(
        freshTopic,
        { summary: "두 번째 결정" },
        ACTOR_ID,
      );
      expect(node2).toBeDefined();

      // 두 Decision 모두 존재
      const decisions = await service.getDecisions(freshTopic);
      expect(decisions).toHaveLength(2);
    });
  });
});
