/**
 * GraphStore — approveSuggestion / rejectSuggestion / getPendingSuggestions 테스트
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDB } from "../../helpers/db";
import { GraphStore } from "~/lib/graph/store";
import { graphEvents } from "~/db/schema-v2";
import { eq } from "drizzle-orm";
import type { DB } from "~/db";
import type { JsonLdGraph, JsonLdNode, EnrichmentSuggestion } from "~/lib/graph/types";

// ─── 헬퍼 ──────────────────────────────────────────────────────────────

function asDB(db: TestDB) {
  return db as unknown as DB;
}

function makeJsonLd(nodes: Record<string, unknown>[] = []): JsonLdGraph {
  return {
    "@context": { dx: "https://discovery-x.io/ns/" },
    "@graph": nodes.map((n) => ({
      "@id": `dx:node-${Math.random().toString(36).slice(2, 8)}`,
      "@type": "dx:Concept",
      ...n,
    })),
  } as JsonLdGraph;
}

function makeNodes(count: number): JsonLdNode[] {
  return Array.from({ length: count }, (_, i) => ({
    "@id": `dx:suggested-${i}`,
    "@type": "dx:Signal",
    "dx:name": `제안 노드 ${i}`,
  }));
}

async function createGraphWithSuggestion(store: GraphStore) {
  const graph = await store.create({
    scopeType: "topic",
    scopeId: `topic-${Math.random().toString(36).slice(2, 8)}`,
    jsonld: makeJsonLd([{ "dx:name": "기존 노드" }]),
    contentHash: "",
  });

  const enrichment: EnrichmentSuggestion = {
    nodes: makeNodes(2),
    reason: "관련 시그널 발견",
  };

  await store.suggest(graph.id, enrichment, {
    actorId: "agent-1",
    actorType: "agent",
  });

  return { graph, enrichment };
}

// ─── 테스트 ─────────────────────────────────────────────────────────────

describe("GraphStore — Suggestion 승인/거절", () => {
  let db: TestDB;
  let store: GraphStore;

  beforeEach(() => {
    db = createTestDb();
    store = new GraphStore(asDB(db));
  });

  // ─── approveSuggestion ─────────────────────────────────────────────

  describe("approveSuggestion", () => {
    it("제안 노드를 Graph에 머지하고 approve 이벤트 기록", async () => {
      const { graph, enrichment } = await createGraphWithSuggestion(store);

      // suggestion ID 조회
      const suggestions = await store.getPendingSuggestions(graph.id);
      expect(suggestions).toHaveLength(1);
      const suggestionId = suggestions[0].id;

      // 승인
      const updated = await store.approveSuggestion(graph.id, suggestionId, {
        actorId: "user-1",
        actorType: "user",
      });

      // 노드 머지 확인: 기존 1 + 제안 2 = 3
      expect(updated.jsonld["@graph"]).toHaveLength(3);

      // 제안 노드가 포함되었는지 확인
      const ids = updated.jsonld["@graph"].map((n) => n["@id"]);
      for (const node of enrichment.nodes!) {
        expect(ids).toContain(node["@id"]);
      }

      // approve 이벤트 기록 확인
      const events = await db
        .select()
        .from(graphEvents)
        .where(eq(graphEvents.graphId, graph.id));

      const approveEvent = events.find((e) => e.action === "approve");
      expect(approveEvent).toBeTruthy();
      expect(approveEvent!.actorId).toBe("user-1");

      const diff = JSON.parse(approveEvent!.diffJson!);
      expect(diff.suggestionEventId).toBe(suggestionId);
    });

    it("중복 @id 노드는 머지하지 않음", async () => {
      // 기존 Graph에 @id가 dx:suggested-0인 노드 포함
      const graph = await store.create({
        scopeType: "topic",
        scopeId: "topic-dedup",
        jsonld: {
          "@context": { dx: "https://discovery-x.io/ns/" },
          "@graph": [
            { "@id": "dx:suggested-0", "@type": "dx:Signal", "dx:name": "기존" },
            { "@id": "dx:existing-1", "@type": "dx:Concept", "dx:name": "원래" },
          ],
        } as JsonLdGraph,
        contentHash: "",
      });

      await store.suggest(graph.id, {
        nodes: [
          { "@id": "dx:suggested-0", "@type": "dx:Signal", "dx:name": "중복" },
          { "@id": "dx:suggested-new", "@type": "dx:Signal", "dx:name": "새노드" },
        ],
        reason: "중복 테스트",
      }, { actorId: "agent-1", actorType: "agent" });

      const suggestions = await store.getPendingSuggestions(graph.id);
      const updated = await store.approveSuggestion(graph.id, suggestions[0].id);

      // 기존 2 + 새 노드 1 = 3 (중복 제외)
      expect(updated.jsonld["@graph"]).toHaveLength(3);
      const ids = updated.jsonld["@graph"].map((n) => n["@id"]);
      expect(ids).toContain("dx:suggested-new");
    });

    it("존재하지 않는 suggestion → Error", async () => {
      const graph = await store.create({
        scopeType: "topic",
        scopeId: "topic-err",
        jsonld: makeJsonLd([]),
        contentHash: "",
      });

      await expect(
        store.approveSuggestion(graph.id, 99999),
      ).rejects.toThrow("Suggestion not found");
    });

    it("이미 처리된 suggestion → Error", async () => {
      const { graph } = await createGraphWithSuggestion(store);
      const suggestions = await store.getPendingSuggestions(graph.id);
      const suggestionId = suggestions[0].id;

      // 첫 번째 승인
      await store.approveSuggestion(graph.id, suggestionId);

      // 두 번째 승인 시도
      await expect(
        store.approveSuggestion(graph.id, suggestionId),
      ).rejects.toThrow("Suggestion already processed");
    });
  });

  // ─── rejectSuggestion ──────────────────────────────────────────────

  describe("rejectSuggestion", () => {
    it("reject 이벤트 기록 + Graph 미변경", async () => {
      const { graph } = await createGraphWithSuggestion(store);
      const suggestions = await store.getPendingSuggestions(graph.id);
      const suggestionId = suggestions[0].id;

      // 거절 전 Graph 상태 저장
      const beforeGraph = await store.get(graph.id);

      await store.rejectSuggestion(graph.id, suggestionId, "관련성 부족", {
        actorId: "user-1",
        actorType: "user",
      });

      // Graph 미변경 확인
      const afterGraph = await store.get(graph.id);
      expect(afterGraph!.version).toBe(beforeGraph!.version);
      expect(afterGraph!.jsonld["@graph"]).toHaveLength(beforeGraph!.jsonld["@graph"].length);

      // reject 이벤트 확인
      const events = await db
        .select()
        .from(graphEvents)
        .where(eq(graphEvents.graphId, graph.id));

      const rejectEvent = events.find((e) => e.action === "reject");
      expect(rejectEvent).toBeTruthy();
      expect(rejectEvent!.reason).toBe("관련성 부족");

      const diff = JSON.parse(rejectEvent!.diffJson!);
      expect(diff.suggestionEventId).toBe(suggestionId);
      expect(diff.rejectReason).toBe("관련성 부족");
    });

    it("존재하지 않는 suggestion → Error", async () => {
      const graph = await store.create({
        scopeType: "topic",
        scopeId: "topic-reject-err",
        jsonld: makeJsonLd([]),
        contentHash: "",
      });

      await expect(
        store.rejectSuggestion(graph.id, 99999),
      ).rejects.toThrow("Suggestion not found");
    });

    it("이미 처리된 suggestion → Error", async () => {
      const { graph } = await createGraphWithSuggestion(store);
      const suggestions = await store.getPendingSuggestions(graph.id);
      const suggestionId = suggestions[0].id;

      // 거절
      await store.rejectSuggestion(graph.id, suggestionId, "테스트");

      // 재거절 시도
      await expect(
        store.rejectSuggestion(graph.id, suggestionId),
      ).rejects.toThrow("Suggestion already processed");
    });
  });

  // ─── getPendingSuggestions ─────────────────────────────────────────

  describe("getPendingSuggestions", () => {
    it("처리된 제안을 필터링하여 미처리 제안만 반환", async () => {
      const graph = await store.create({
        scopeType: "topic",
        scopeId: "topic-filter",
        jsonld: makeJsonLd([]),
        contentHash: "",
      });

      // 3개 제안 생성
      for (let i = 0; i < 3; i++) {
        await store.suggest(graph.id, {
          nodes: [{ "@id": `dx:node-${i}`, "@type": "dx:Signal", "dx:name": `노드${i}` }],
          reason: `제안 ${i}`,
        }, { actorId: "agent-1", actorType: "agent" });
      }

      // 3개 모두 pending
      let pending = await store.getPendingSuggestions(graph.id);
      expect(pending).toHaveLength(3);

      // 첫 번째 승인
      await store.approveSuggestion(graph.id, pending[0].id);

      // 2개 남음
      pending = await store.getPendingSuggestions(graph.id);
      expect(pending).toHaveLength(2);

      // 두 번째 거절
      await store.rejectSuggestion(graph.id, pending[0].id, "불필요");

      // 1개 남음
      pending = await store.getPendingSuggestions(graph.id);
      expect(pending).toHaveLength(1);
    });

    it("제안이 없으면 빈 배열 반환", async () => {
      const graph = await store.create({
        scopeType: "topic",
        scopeId: "topic-empty",
        jsonld: makeJsonLd([]),
        contentHash: "",
      });

      const pending = await store.getPendingSuggestions(graph.id);
      expect(pending).toHaveLength(0);
    });
  });
});
