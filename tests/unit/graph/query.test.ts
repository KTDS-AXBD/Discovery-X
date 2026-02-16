/**
 * GraphQueryEngine 테스트
 *
 * 테스트 대상:
 * - get(): Graph 내 특정 @id 노드 찾기
 * - findByType(): 특정 @type 노드 필터링
 * - traverse(): BFS 관계 탐색 (depth=1, depth=2, 순환 참조)
 * - extractPath(): json_extract 값 추출
 * - semanticSearch(): keyword 매칭 + scopeFilter
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDB } from "../../helpers/db";
import { GraphQueryEngine } from "~/lib/graph/query";
import { graphs } from "~/db/schema-v2";
import type { DB } from "~/db";
import type { JsonLdGraph } from "~/lib/graph/types";

// ─── 헬퍼 ──────────────────────────────────────────────────────────────

function asDB(db: TestDB) {
  return db as unknown as DB;
}

/** 테스트용 Graph를 graphs 테이블에 직접 삽입 */
async function insertGraph(
  db: TestDB,
  id: string,
  scopeType: string,
  scopeId: string,
  jsonld: JsonLdGraph,
) {
  await db.insert(graphs).values({
    id,
    scopeType,
    scopeId,
    jsonld: JSON.stringify(jsonld),
    version: 1,
    contentHash: `hash-${id}`,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

// ─── 테스트 데이터 ─────────────────────────────────────────────────────

const sampleGraph: JsonLdGraph = {
  "@context": { dx: "https://discovery-x.io/ns/" },
  "@graph": [
    { "@id": "dx:user-1", "@type": "dx:User", "dx:name": "홍길동", "dx:role": "BD" },
    { "@id": "dx:exp-1", "@type": "dx:Expertise", "dx:label": "AI", "dx:level": "상" },
    { "@id": "dx:topic-1", "@type": "dx:Topic", "dx:name": "AI 트렌드" },
  ],
};

// traverse 테스트용: A → B → C 관계 (dx:relatedTo)
const traverseGraph: JsonLdGraph = {
  "@context": { dx: "https://discovery-x.io/ns/" },
  "@graph": [
    { "@id": "dx:a", "@type": "dx:Topic", "dx:name": "A", "dx:relatedTo": "dx:b" },
    { "@id": "dx:b", "@type": "dx:Topic", "dx:name": "B", "dx:relatedTo": ["dx:c", "dx:d"] },
    { "@id": "dx:c", "@type": "dx:Topic", "dx:name": "C" },
    { "@id": "dx:d", "@type": "dx:Decision", "dx:summary": "D 결정" },
  ],
};

// 순환 참조 테스트: X → Y → X
const cyclicGraph: JsonLdGraph = {
  "@context": { dx: "https://discovery-x.io/ns/" },
  "@graph": [
    { "@id": "dx:x", "@type": "dx:Topic", "dx:name": "X", "dx:relatedTo": "dx:y" },
    { "@id": "dx:y", "@type": "dx:Topic", "dx:name": "Y", "dx:relatedTo": "dx:x" },
  ],
};

// ─── 테스트 ─────────────────────────────────────────────────────────────

describe("GraphQueryEngine", () => {
  let db: TestDB;
  let engine: GraphQueryEngine;

  beforeEach(async () => {
    db = createTestDb();
    engine = new GraphQueryEngine(asDB(db));
  });

  // ─── get ────────────────────────────────────────────────────────────

  describe("get", () => {
    it("Graph 내 특정 @id 노드 찾기", async () => {
      await insertGraph(db, "g1", "user", "user-1", sampleGraph);

      const node = await engine.get("g1", "dx:user-1");
      expect(node).not.toBeNull();
      expect(node!["@type"]).toBe("dx:User");
      expect(node!["dx:name"]).toBe("홍길동");
    });

    it("없는 노드 → null", async () => {
      await insertGraph(db, "g2", "user", "user-2", sampleGraph);

      const node = await engine.get("g2", "dx:non-existent");
      expect(node).toBeNull();
    });

    it("없는 Graph → null", async () => {
      const node = await engine.get("no-graph", "dx:user-1");
      expect(node).toBeNull();
    });
  });

  // ─── findByType ─────────────────────────────────────────────────────

  describe("findByType", () => {
    it("특정 @type 노드만 필터링", async () => {
      await insertGraph(db, "g3", "user", "user-3", sampleGraph);

      const expertise = await engine.findByType("user", "user-3", "dx:Expertise");
      expect(expertise).toHaveLength(1);
      expect(expertise[0]["dx:label"]).toBe("AI");
    });

    it("매칭되는 @type이 없으면 빈 배열", async () => {
      await insertGraph(db, "g4", "user", "user-4", sampleGraph);

      const decisions = await engine.findByType("user", "user-4", "dx:Decision");
      expect(decisions).toHaveLength(0);
    });

    it("없는 scope → 빈 배열", async () => {
      const result = await engine.findByType("org", "no-org", "dx:User");
      expect(result).toHaveLength(0);
    });
  });

  // ─── traverse ───────────────────────────────────────────────────────

  describe("traverse", () => {
    it("depth=1: 직접 연결 노드 반환", async () => {
      await insertGraph(db, "g-tr", "topic", "topic-tr", traverseGraph);

      const result = await engine.traverse("dx:a", "dx:relatedTo", 1);
      const ids = result.map((n) => n["@id"]);

      expect(ids).toContain("dx:b");
      expect(ids).not.toContain("dx:c"); // depth=1이면 B까지만
    });

    it("depth=2: 2단계 관계 탐색", async () => {
      await insertGraph(db, "g-tr2", "topic", "topic-tr2", traverseGraph);

      const result = await engine.traverse("dx:a", "dx:relatedTo", 2);
      const ids = result.map((n) => n["@id"]);

      expect(ids).toContain("dx:b");
      expect(ids).toContain("dx:c");
      expect(ids).toContain("dx:d");
    });

    it("순환 참조 안전 (무한 루프 방지)", async () => {
      await insertGraph(db, "g-cyc", "topic", "topic-cyc", cyclicGraph);

      const result = await engine.traverse("dx:x", "dx:relatedTo", 10);
      // 순환이 있어도 무한 루프 없이 종료
      const ids = result.map((n) => n["@id"]);
      expect(ids).toContain("dx:y");
      // 시작 노드(dx:x)는 결과에 포함되지 않음
      expect(ids).not.toContain("dx:x");
    });
  });

  // ─── extractPath ───────────────────────────────────────────────────

  describe("extractPath", () => {
    it("json_extract로 값 추출", async () => {
      await insertGraph(db, "g-ep", "user", "user-ep", sampleGraph);

      // 첫 번째 노드의 @type 추출
      const type = await engine.extractPath(
        "g-ep",
        '$."@graph"[0]."@type"',
      );
      expect(type).toBe("dx:User");
    });

    it("없는 Graph → null", async () => {
      const result = await engine.extractPath("no-graph", "$");
      expect(result).toBeNull();
    });
  });

  // ─── semanticSearch ────────────────────────────────────────────────

  describe("semanticSearch", () => {
    it("keyword 매칭 (포함 = score 1.0)", async () => {
      await insertGraph(db, "g-ss", "user", "user-ss", sampleGraph);

      const results = await engine.semanticSearch("홍길동");
      expect(results.length).toBeGreaterThan(0);

      const match = results.find((r) => r.node["dx:name"] === "홍길동");
      expect(match).toBeTruthy();
      expect(match!.score).toBe(1.0);
    });

    it("매칭 없으면 빈 배열", async () => {
      await insertGraph(db, "g-ss2", "user", "user-ss2", sampleGraph);

      const results = await engine.semanticSearch("존재하지않는키워드");
      expect(results).toHaveLength(0);
    });

    it("scopeFilter 적용", async () => {
      await insertGraph(db, "g-s1", "user", "u-1", sampleGraph);
      await insertGraph(db, "g-s2", "topic", "t-1", {
        "@context": { dx: "https://discovery-x.io/ns/" },
        "@graph": [
          { "@id": "dx:other", "@type": "dx:Topic", "dx:name": "홍길동 관련 토픽" },
        ],
      });

      // user scope만 검색
      const results = await engine.semanticSearch("홍길동", {
        scopeType: "user",
        scopeId: "u-1",
      });

      // user scope의 결과만 반환
      expect(results.every((r) => r.source.scopeType === "user")).toBe(true);
    });
  });
});
