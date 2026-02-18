/**
 * GraphStore 통합 테스트
 *
 * 실제 in-memory SQLite DB로 GraphStore의 CRUD + rollback 워크플로우를 검증한다.
 * 단위 테스트와 달리, 다단계 워크플로우(create→update→rollback)의 데이터 정합성에 집중.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDB } from "../../helpers/db";
import { GraphStore } from "~/lib/graph/store";
import { graphEvents } from "~/db/schema-v2";
import { eq, and } from "drizzle-orm";
import type { DB } from "~/db";
import type { JsonLdGraph, ScopeType } from "~/lib/graph/types";
import { ActorType } from "~/lib/types/enums";

// ─── 헬퍼 ──────────────────────────────────────────────────────────────

function asDB(db: TestDB) {
  return db as unknown as DB;
}

function makeJsonLd(
  nodes: Record<string, unknown>[] = [],
  context: Record<string, unknown> = { dx: "https://discovery-x.io/ns/" },
): JsonLdGraph {
  return {
    "@context": context,
    "@graph": nodes.map((n, i) => ({
      "@id": `dx:node-${i}`,
      "@type": "dx:User",
      ...n,
    })),
  } as JsonLdGraph;
}

/** Graph 생성 헬퍼 — 반복 코드 최소화 */
async function createGraph(
  store: GraphStore,
  scopeType: ScopeType,
  scopeId: string,
  nodes: Record<string, unknown>[] = [],
) {
  return store.create({
    scopeType,
    scopeId,
    jsonld: makeJsonLd(nodes),
    contentHash: "",
  });
}

// ─── 테스트 ─────────────────────────────────────────────────────────────

describe("GraphStore 통합 테스트", () => {
  let db: TestDB;
  let store: GraphStore;

  beforeEach(() => {
    db = createTestDb();
    store = new GraphStore(asDB(db));
  });

  // ─── initGraph (create) ───────────────────────────────────────────────

  describe("initGraph (create)", () => {
    it("user scope 그래프 생성", async () => {
      const result = await createGraph(store, "user", "user-int-1", [
        { "dx:name": "테스트유저", "dx:role": "BD매니저" },
      ]);

      expect(result.id).toBeTruthy();
      expect(result.scopeType).toBe("user");
      expect(result.scopeId).toBe("user-int-1");
      expect(result.version).toBe(1);
      expect(result.contentHash).toHaveLength(64); // SHA-256 hex
      expect(result.jsonld["@graph"]).toHaveLength(1);
      expect(result.jsonld["@graph"][0]["dx:name"]).toBe("테스트유저");
    });

    it("topic scope 그래프 생성", async () => {
      const result = await createGraph(store, "topic", "topic-int-1", [
        { "@type": "dx:Topic", "dx:name": "AI 에이전트", "dx:description": "시장 분석" },
      ]);

      expect(result.scopeType).toBe("topic");
      expect(result.scopeId).toBe("topic-int-1");
      expect(result.version).toBe(1);
      expect(result.jsonld["@graph"][0]["dx:name"]).toBe("AI 에이전트");
    });

    it("빈 @context로 생성 시 DX_CONTEXT 기본값 적용", async () => {
      const emptyCtxGraph = makeJsonLd(
        [{ "dx:name": "기본컨텍스트" }],
        {}, // 빈 context
      );

      const result = await store.create({
        scopeType: "user",
        scopeId: "user-default-ctx",
        jsonld: emptyCtxGraph,
        contentHash: "",
      });

      // DX_CONTEXT의 dx prefix가 적용되어야 함
      expect(result.jsonld["@context"]).toHaveProperty("dx");
      expect(result.jsonld["@context"]["dx"]).toBe("https://discovery-x.app/ns/");
    });
  });

  // ─── getGraph (get) ───────────────────────────────────────────────────

  describe("getGraph (get)", () => {
    it("존재하는 그래프 조회", async () => {
      const created = await createGraph(store, "user", "user-get-1", [
        { "dx:name": "조회테스트" },
      ]);

      const found = await store.get(created.id);

      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
      expect(found!.version).toBe(1);
      expect(found!.scopeType).toBe("user");
      expect(found!.jsonld["@graph"][0]["dx:name"]).toBe("조회테스트");
    });

    it("존재하지 않는 graphId는 null 반환", async () => {
      const found = await store.get("non-existent-graph-id");
      expect(found).toBeNull();
    });

    it("getByScopeId로 scope 기반 조회", async () => {
      await createGraph(store, "topic", "topic-scope-1", [
        { "@type": "dx:Topic", "dx:name": "스코프조회" },
      ]);

      const found = await store.getByScopeId("topic", "topic-scope-1");
      expect(found).not.toBeNull();
      expect(found!.scopeType).toBe("topic");
      expect(found!.scopeId).toBe("topic-scope-1");
    });
  });

  // ─── updateGraph (update) ─────────────────────────────────────────────

  describe("updateGraph (update)", () => {
    it("JSON-LD 업데이트 시 버전 증가", async () => {
      const created = await createGraph(store, "user", "user-upd-1", [
        { "dx:name": "v1" },
      ]);

      const v2JsonLd = makeJsonLd([{ "dx:name": "v2-업데이트" }]);
      const updated = await store.update(created.id, v2JsonLd);

      expect(updated.version).toBe(2);
      expect(updated.jsonld["@graph"][0]["dx:name"]).toBe("v2-업데이트");
      expect(updated.contentHash).not.toBe(created.contentHash);

      // DB에서 직접 조회해도 버전 2
      const fromDb = await store.get(created.id);
      expect(fromDb!.version).toBe(2);
    });

    it("diff_json에 prev/next 변경 내용 저장", async () => {
      const created = await createGraph(store, "user", "user-upd-2", [
        { "dx:name": "이전값" },
      ]);

      const newJsonLd = makeJsonLd([{ "dx:name": "이후값" }]);
      await store.update(created.id, newJsonLd, "이름 변경");

      const events = await db
        .select()
        .from(graphEvents)
        .where(
          and(
            eq(graphEvents.graphId, created.id),
            eq(graphEvents.action, "update"),
          ),
        );

      expect(events).toHaveLength(1);
      const diff = JSON.parse(events[0].diffJson!);
      expect(diff.prev["@graph"][0]["dx:name"]).toBe("이전값");
      expect(diff.next["@graph"][0]["dx:name"]).toBe("이후값");
    });

    it("audit context (actorId, actorType) 기록", async () => {
      const created = await createGraph(store, "user", "user-upd-3", [
        { "dx:name": "감사테스트" },
      ]);

      const newJsonLd = makeJsonLd([{ "dx:name": "감사변경" }]);
      await store.update(created.id, newJsonLd, "감사 테스트", {
        actorId: "user-abc-123",
        actorType: ActorType.USER,
      });

      const events = await db
        .select()
        .from(graphEvents)
        .where(
          and(
            eq(graphEvents.graphId, created.id),
            eq(graphEvents.action, "update"),
          ),
        );

      expect(events[0].actorId).toBe("user-abc-123");
      expect(events[0].actorType).toBe("user");
      expect(events[0].reason).toBe("감사 테스트");
    });

    it("연속 업데이트 시 버전 순차 증가", async () => {
      const created = await createGraph(store, "user", "user-upd-seq", [
        { "dx:name": "v1" },
      ]);

      const v2 = await store.update(created.id, makeJsonLd([{ "dx:name": "v2" }]));
      const v3 = await store.update(created.id, makeJsonLd([{ "dx:name": "v3" }]));
      const v4 = await store.update(created.id, makeJsonLd([{ "dx:name": "v4" }]));

      expect(v2.version).toBe(2);
      expect(v3.version).toBe(3);
      expect(v4.version).toBe(4);

      // 이벤트 로그도 4개 (create + 3 updates)
      const events = await db
        .select()
        .from(graphEvents)
        .where(eq(graphEvents.graphId, created.id));
      expect(events).toHaveLength(4);
    });
  });

  // ─── rollback ─────────────────────────────────────────────────────────

  describe("rollback", () => {
    it("특정 버전으로 롤백 시 해당 버전의 JSON-LD 상태 복원", async () => {
      // v1 → v2 → v3 → rollback to v2
      const created = await createGraph(store, "user", "user-rb-1", [
        { "dx:name": "v1-원본" },
      ]);

      const v2JsonLd = makeJsonLd([{ "dx:name": "v2-수정" }]);
      await store.update(created.id, v2JsonLd);

      const v3JsonLd = makeJsonLd([{ "dx:name": "v3-최종" }]);
      await store.update(created.id, v3JsonLd);

      // v2로 롤백
      const rolledBack = await store.rollback(created.id, 2);

      // v2의 JSON-LD가 복원되어야 함
      expect(rolledBack.jsonld["@graph"][0]["dx:name"]).toBe("v2-수정");
    });

    it("롤백도 새 버전으로 생성되어 이력 보존", async () => {
      const created = await createGraph(store, "user", "user-rb-2", [
        { "dx:name": "v1" },
      ]);

      await store.update(created.id, makeJsonLd([{ "dx:name": "v2" }]));
      await store.update(created.id, makeJsonLd([{ "dx:name": "v3" }]));

      // 현재 v3 → v2로 롤백 → 새 버전은 v4
      const rolledBack = await store.rollback(created.id, 2);
      expect(rolledBack.version).toBe(4);

      // rollback 이벤트가 기록됨
      const events = await db
        .select()
        .from(graphEvents)
        .where(
          and(
            eq(graphEvents.graphId, created.id),
            eq(graphEvents.action, "rollback"),
          ),
        );

      expect(events).toHaveLength(1);
      expect(events[0].prevVersion).toBe(3);
      expect(events[0].newVersion).toBe(4);
      expect(events[0].reason).toContain("v2");
    });

    it("v1(create 이벤트)으로 롤백 시 원본 상태 복원", async () => {
      // v1 → v2 → rollback to v1
      const v1JsonLd = makeJsonLd([{ "dx:name": "원본-v1" }]);
      const created = await store.create({
        scopeType: "user",
        scopeId: "user-rb-v1",
        jsonld: v1JsonLd,
        contentHash: "",
      });

      await store.update(created.id, makeJsonLd([{ "dx:name": "변경-v2" }]));

      // v1으로 롤백 — create 이벤트에는 diffJson이 없으므로 특수 로직 사용
      const rolledBack = await store.rollback(created.id, 1);

      expect(rolledBack.jsonld["@graph"][0]["dx:name"]).toBe("원본-v1");
      expect(rolledBack.version).toBe(3); // v2 → v1 롤백 = v3
    });

    it("존재하지 않는 버전으로 롤백 시 에러", async () => {
      const created = await createGraph(store, "user", "user-rb-err", [
        { "dx:name": "에러테스트" },
      ]);

      // 현재 v1인데 v5로 롤백 시도 → 에러
      await expect(store.rollback(created.id, 5)).rejects.toThrow(
        "Invalid target version",
      );
    });

    it("현재 버전 이상으로 롤백 시 에러", async () => {
      const created = await createGraph(store, "user", "user-rb-same", [
        { "dx:name": "같은버전" },
      ]);

      await store.update(created.id, makeJsonLd([{ "dx:name": "v2" }]));

      // 현재 v2인데 v2로 롤백 시도 → 에러 (targetVersion >= existing.version)
      await expect(store.rollback(created.id, 2)).rejects.toThrow(
        "Invalid target version",
      );
    });

    it("롤백 후 다시 업데이트 가능", async () => {
      const created = await createGraph(store, "user", "user-rb-resume", [
        { "dx:name": "v1" },
      ]);

      await store.update(created.id, makeJsonLd([{ "dx:name": "v2" }]));
      await store.rollback(created.id, 1); // v3

      // 롤백 후 다시 업데이트
      const v4 = await store.update(
        created.id,
        makeJsonLd([{ "dx:name": "v4-새작업" }]),
      );

      expect(v4.version).toBe(4);
      expect(v4.jsonld["@graph"][0]["dx:name"]).toBe("v4-새작업");
    });
  });

  // ─── 이벤트 히스토리 ──────────────────────────────────────────────────

  describe("getHistory", () => {
    it("전체 워크플로우 이벤트가 순서대로 기록", async () => {
      const created = await createGraph(store, "user", "user-hist", [
        { "dx:name": "v1" },
      ]);

      await store.update(created.id, makeJsonLd([{ "dx:name": "v2" }]), "첫 수정");
      await store.update(created.id, makeJsonLd([{ "dx:name": "v3" }]), "두번째 수정");
      await store.rollback(created.id, 1);

      const history = await store.getHistory(created.id);

      // 4개 이벤트: create, update, update, rollback
      expect(history).toHaveLength(4);
      // 최신순
      expect(history[0].action).toBe("rollback");
      expect(history[1].action).toBe("update");
      expect(history[2].action).toBe("update");
      expect(history[3].action).toBe("create");
    });
  });
});
