/**
 * GraphStore 테스트
 *
 * 테스트 대상:
 * - computeContentHash(): SHA-256 해시 일관성
 * - GraphStore CRUD: create, get, getByScopeId, update, delete
 * - 감사 이벤트: create/update/delete 시 graphEvents 기록
 * - getHistory(): 최신순 이벤트 반환
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDB } from "../../helpers/db";
import { GraphStore, computeContentHash } from "~/lib/graph/store";
import { graphEvents } from "~/db/schema-v2";
import { eq } from "drizzle-orm";
import type { DB } from "~/db";
import type { JsonLdGraph } from "~/lib/graph/types";

// ─── 헬퍼 ──────────────────────────────────────────────────────────────

function asDB(db: TestDB) {
  return db as unknown as DB;
}

function makeJsonLd(nodes: Record<string, unknown>[] = []): JsonLdGraph {
  return {
    "@context": { dx: "https://discovery-x.io/ns/" },
    "@graph": nodes.map((n) => ({
      "@id": `dx:node-${Math.random().toString(36).slice(2, 8)}`,
      "@type": "dx:User",
      ...n,
    })),
  } as JsonLdGraph;
}

// ─── 테스트 ─────────────────────────────────────────────────────────────

describe("computeContentHash", () => {
  it("같은 입력 → 같은 해시", async () => {
    const graph = makeJsonLd([{ "dx:name": "테스트" }]);
    const hash1 = await computeContentHash(graph);
    const hash2 = await computeContentHash(graph);
    expect(hash1).toBe(hash2);
  });

  it("다른 입력 → 다른 해시", async () => {
    const graph1 = makeJsonLd([{ "dx:name": "A" }]);
    const graph2 = makeJsonLd([{ "dx:name": "B" }]);
    const hash1 = await computeContentHash(graph1);
    const hash2 = await computeContentHash(graph2);
    expect(hash1).not.toBe(hash2);
  });
});

describe("GraphStore", () => {
  let db: TestDB;
  let store: GraphStore;

  beforeEach(() => {
    db = createTestDb();
    store = new GraphStore(asDB(db));
  });

  // ─── create ─────────────────────────────────────────────────────────

  describe("create", () => {
    it("새 Graph 생성 + version=1 + contentHash 설정", async () => {
      const jsonld = makeJsonLd([{ "dx:name": "홍길동" }]);

      const result = await store.create({
        scopeType: "user",
        scopeId: "user-1",
        jsonld,
        contentHash: "", // 무시됨 — create 내부에서 재계산
      });

      expect(result.id).toBeTruthy();
      expect(result.version).toBe(1);
      expect(result.contentHash).toBeTruthy();
      expect(result.scopeType).toBe("user");
      expect(result.scopeId).toBe("user-1");
      expect(result.jsonld).toEqual(jsonld);
    });

    it("graphEvents에 create 이벤트 기록", async () => {
      const jsonld = makeJsonLd([]);
      const result = await store.create({
        scopeType: "user",
        scopeId: "user-2",
        jsonld,
        contentHash: "",
      });

      const events = await db
        .select()
        .from(graphEvents)
        .where(eq(graphEvents.graphId, result.id));

      expect(events).toHaveLength(1);
      expect(events[0].action).toBe("create");
      expect(events[0].newVersion).toBe(1);
      expect(events[0].actorType).toBe("system");
    });
  });

  // ─── get ────────────────────────────────────────────────────────────

  describe("get", () => {
    it("ID로 조회 성공", async () => {
      const created = await store.create({
        scopeType: "user",
        scopeId: "user-3",
        jsonld: makeJsonLd([]),
        contentHash: "",
      });

      const found = await store.get(created.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
      expect(found!.version).toBe(1);
    });

    it("존재하지 않는 ID → null", async () => {
      const found = await store.get("non-existent-id");
      expect(found).toBeNull();
    });
  });

  // ─── getByScopeId ──────────────────────────────────────────────────

  describe("getByScopeId", () => {
    it("scope로 조회 성공", async () => {
      await store.create({
        scopeType: "topic",
        scopeId: "topic-1",
        jsonld: makeJsonLd([]),
        contentHash: "",
      });

      const found = await store.getByScopeId("topic", "topic-1");
      expect(found).not.toBeNull();
      expect(found!.scopeType).toBe("topic");
      expect(found!.scopeId).toBe("topic-1");
    });

    it("존재하지 않는 scope → null", async () => {
      const found = await store.getByScopeId("org", "no-org");
      expect(found).toBeNull();
    });
  });

  // ─── update ─────────────────────────────────────────────────────────

  describe("update", () => {
    it("version 증가 + contentHash 갱신", async () => {
      const created = await store.create({
        scopeType: "user",
        scopeId: "user-4",
        jsonld: makeJsonLd([{ "dx:name": "v1" }]),
        contentHash: "",
      });

      const newJsonLd = makeJsonLd([{ "dx:name": "v2" }]);
      const updated = await store.update(created.id, newJsonLd);

      expect(updated.version).toBe(2);
      expect(updated.contentHash).not.toBe(created.contentHash);
      expect(updated.jsonld).toEqual(newJsonLd);
    });

    it("graphEvents에 update 이벤트 + diff_json 포함", async () => {
      const created = await store.create({
        scopeType: "user",
        scopeId: "user-5",
        jsonld: makeJsonLd([{ "dx:name": "이전" }]),
        contentHash: "",
      });

      const newJsonLd = makeJsonLd([{ "dx:name": "이후" }]);
      await store.update(created.id, newJsonLd, "이름 변경");

      const events = await db
        .select()
        .from(graphEvents)
        .where(eq(graphEvents.graphId, created.id));

      // create + update = 2개
      const updateEvent = events.find((e) => e.action === "update");
      expect(updateEvent).toBeTruthy();
      expect(updateEvent!.diffJson).toBeTruthy();
      expect(updateEvent!.reason).toBe("이름 변경");
      expect(updateEvent!.prevVersion).toBe(1);
      expect(updateEvent!.newVersion).toBe(2);

      // diff_json에 prev/next 구조 확인
      const diff = JSON.parse(updateEvent!.diffJson!);
      expect(diff).toHaveProperty("prev");
      expect(diff).toHaveProperty("next");
    });

    it("존재하지 않는 ID → Error throw", async () => {
      await expect(
        store.update("non-existent", makeJsonLd([])),
      ).rejects.toThrow("Graph not found");
    });
  });

  // ─── delete ─────────────────────────────────────────────────────────

  describe("delete", () => {
    it("삭제 후 get → null + graphEvents에 delete 이벤트", async () => {
      // D1은 기본 foreign_keys=OFF — 테스트에서도 동일하게 맞춤
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((db as any).session.client).pragma("foreign_keys = OFF");

      const created = await store.create({
        scopeType: "user",
        scopeId: "user-6",
        jsonld: makeJsonLd([]),
        contentHash: "",
      });

      await store.delete(created.id);

      // 삭제 확인
      const found = await store.get(created.id);
      expect(found).toBeNull();

      // delete 이벤트 확인 (고아 레코드로 보존됨)
      const events = await db
        .select()
        .from(graphEvents)
        .where(eq(graphEvents.graphId, created.id));

      const deleteEvent = events.find((e) => e.action === "delete");
      expect(deleteEvent).toBeTruthy();
      expect(deleteEvent!.prevVersion).toBe(1);
    });
  });

  // ─── getHistory ─────────────────────────────────────────────────────

  describe("getHistory", () => {
    it("이벤트 최신순 반환", async () => {
      const created = await store.create({
        scopeType: "user",
        scopeId: "user-7",
        jsonld: makeJsonLd([{ "dx:name": "v1" }]),
        contentHash: "",
      });

      await store.update(created.id, makeJsonLd([{ "dx:name": "v2" }]));
      await store.update(created.id, makeJsonLd([{ "dx:name": "v3" }]));

      const history = await store.getHistory(created.id);

      expect(history).toHaveLength(3); // create + 2 updates
      // 최신이 먼저
      expect(history[0].action).toBe("update");
      expect(history[0].newVersion).toBe(3);
      expect(history[history.length - 1].action).toBe("create");
    });
  });
});
