/**
 * Matrix 도메인 Graph Query 테스트
 *
 * 테스트 대상:
 * - findCellsByIndustry(): industryId 기반 Cell 필터링
 * - findCellsByFunction(): functionId 기반 Cell 필터링
 * - findLinkedTopics(): Cell → Topic 연결 탐색
 * - findByType(): mx: 접두사 노드 타입 필터링
 * - semanticSearch(): Matrix 노드 keyword 매칭
 * - validateGraph(): mx: 노드 검증 통과 확인
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDB } from "../../helpers/db";
import { GraphQueryEngine } from "~/lib/graph/query";
import { validateGraph } from "~/lib/graph/validator";
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

const matrixGraph: JsonLdGraph = {
  "@context": {
    dx: "https://discovery-x.app/ns/",
    mx: "https://discovery-x.app/ns/matrix/",
  },
  "@graph": [
    { "@id": "mx:industry/auto", "@type": "mx:Industry", "mx:name": "자동차" },
    { "@id": "mx:industry/pharma", "@type": "mx:Industry", "mx:name": "제약" },
    {
      "@id": "mx:function/ai",
      "@type": "mx:Function",
      "mx:name": "AI 서비스",
      "mx:category": "ai_service",
    },
    {
      "@id": "mx:cell/auto_ai",
      "@type": "mx:Cell",
      "mx:industryId": { "@id": "mx:industry/auto" },
      "mx:functionId": { "@id": "mx:function/ai" },
      "mx:status": "active",
      "mx:pipelineStage": "signal",
      "mx:linkedTopic": [{ "@id": "dx:topic/topic-1" }],
    },
    {
      "@id": "mx:cell/pharma_ai",
      "@type": "mx:Cell",
      "mx:industryId": { "@id": "mx:industry/pharma" },
      "mx:functionId": { "@id": "mx:function/ai" },
      "mx:status": "active",
    },
  ],
};

/** findLinkedTopics 테스트용: Cell에서 참조하는 Topic 노드가 같은 그래프에 존재 */
const matrixWithTopics: JsonLdGraph = {
  "@context": {
    dx: "https://discovery-x.app/ns/",
    mx: "https://discovery-x.app/ns/matrix/",
  },
  "@graph": [
    {
      "@id": "mx:cell/auto_ai",
      "@type": "mx:Cell",
      "mx:industryId": { "@id": "mx:industry/auto" },
      "mx:functionId": { "@id": "mx:function/ai" },
      "mx:linkedTopic": [{ "@id": "dx:topic/topic-1" }],
    },
    {
      "@id": "dx:topic/topic-1",
      "@type": "dx:Topic",
      "dx:name": "자율주행 AI 트렌드",
    },
  ],
};

// ─── 테스트 ─────────────────────────────────────────────────────────────

describe("Matrix GraphQueryEngine", () => {
  let db: TestDB;
  let engine: GraphQueryEngine;

  beforeEach(async () => {
    db = createTestDb();
    engine = new GraphQueryEngine(asDB(db));
  });

  // ─── findCellsByIndustry ──────────────────────────────────────────────

  describe("findCellsByIndustry", () => {
    it("industryId로 해당 산업의 Cell만 반환", async () => {
      await insertGraph(db, "mx-g1", "org", "team-1", matrixGraph);

      const autoCells = await engine.findCellsByIndustry("team-1", "mx:industry/auto");
      expect(autoCells).toHaveLength(1);
      expect(autoCells[0]["@id"]).toBe("mx:cell/auto_ai");
    });

    it("다른 industryId로 필터링", async () => {
      await insertGraph(db, "mx-g2", "org", "team-1", matrixGraph);

      const pharmaCells = await engine.findCellsByIndustry("team-1", "mx:industry/pharma");
      expect(pharmaCells).toHaveLength(1);
      expect(pharmaCells[0]["@id"]).toBe("mx:cell/pharma_ai");
    });

    it("매칭되는 Cell이 없으면 빈 배열", async () => {
      await insertGraph(db, "mx-g3", "org", "team-1", matrixGraph);

      const cells = await engine.findCellsByIndustry("team-1", "mx:industry/nonexistent");
      expect(cells).toHaveLength(0);
    });
  });

  // ─── findCellsByFunction ──────────────────────────────────────────────

  describe("findCellsByFunction", () => {
    it("functionId로 해당 기능의 Cell 모두 반환", async () => {
      await insertGraph(db, "mx-g4", "org", "team-1", matrixGraph);

      const aiCells = await engine.findCellsByFunction("team-1", "mx:function/ai");
      expect(aiCells).toHaveLength(2);

      const ids = aiCells.map((n) => n["@id"]);
      expect(ids).toContain("mx:cell/auto_ai");
      expect(ids).toContain("mx:cell/pharma_ai");
    });

    it("매칭되는 Cell이 없으면 빈 배열", async () => {
      await insertGraph(db, "mx-g5", "org", "team-1", matrixGraph);

      const cells = await engine.findCellsByFunction("team-1", "mx:function/nonexistent");
      expect(cells).toHaveLength(0);
    });
  });

  // ─── findLinkedTopics ─────────────────────────────────────────────────

  describe("findLinkedTopics", () => {
    it("Cell에 연결된 Topic 노드 반환", async () => {
      await insertGraph(db, "mx-g6", "org", "team-1", matrixWithTopics);

      const topics = await engine.findLinkedTopics("mx:cell/auto_ai");
      expect(topics).toHaveLength(1);
      expect(topics[0]["@id"]).toBe("dx:topic/topic-1");
      expect(topics[0]["dx:name"]).toBe("자율주행 AI 트렌드");
    });

    it("linkedTopic이 없는 Cell → 빈 배열", async () => {
      await insertGraph(db, "mx-g7", "org", "team-1", matrixGraph);

      const topics = await engine.findLinkedTopics("mx:cell/pharma_ai");
      expect(topics).toHaveLength(0);
    });
  });

  // ─── findByType (mx: 타입) ────────────────────────────────────────────

  describe("findByType (Matrix 노드)", () => {
    it("mx:Cell 타입 노드만 필터링", async () => {
      await insertGraph(db, "mx-g8", "org", "team-1", matrixGraph);

      const cells = await engine.findByType("org", "team-1", "mx:Cell");
      expect(cells).toHaveLength(2);
    });

    it("mx:Industry 타입 노드만 필터링", async () => {
      await insertGraph(db, "mx-g9", "org", "team-1", matrixGraph);

      const industries = await engine.findByType("org", "team-1", "mx:Industry");
      expect(industries).toHaveLength(2);

      const names = industries.map((n) => n["mx:name"]);
      expect(names).toContain("자동차");
      expect(names).toContain("제약");
    });

    it("mx:Function 타입 노드만 필터링", async () => {
      await insertGraph(db, "mx-g10", "org", "team-1", matrixGraph);

      const functions = await engine.findByType("org", "team-1", "mx:Function");
      expect(functions).toHaveLength(1);
      expect(functions[0]["mx:name"]).toBe("AI 서비스");
    });
  });

  // ─── semanticSearch ───────────────────────────────────────────────────

  describe("semanticSearch (Matrix 노드)", () => {
    it("keyword 매칭 — '자동차' → Industry 노드", async () => {
      await insertGraph(db, "mx-g11", "org", "team-1", matrixGraph);

      const results = await engine.semanticSearch("자동차");
      expect(results.length).toBeGreaterThan(0);

      const match = results.find((r) => r.node["@id"] === "mx:industry/auto");
      expect(match).toBeTruthy();
      expect(match!.score).toBe(1.0);
    });

    it("scopeFilter로 team scope만 검색", async () => {
      await insertGraph(db, "mx-g12", "org", "team-1", matrixGraph);

      const results = await engine.semanticSearch("AI", {
        scopeType: "org",
        scopeId: "team-1",
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results.every((r) => r.source.scopeType === "org")).toBe(true);
    });
  });

  // ─── Validator ────────────────────────────────────────────────────────

  describe("validateGraph (Matrix 노드)", () => {
    it("mx: 네임스페이스 노드가 포함된 그래프 검증 통과", () => {
      const result = validateGraph(matrixGraph);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("mx: + dx: 혼합 그래프도 검증 통과", () => {
      const result = validateGraph(matrixWithTopics);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("허용되지 않는 mx: 타입은 거부", () => {
      const invalidGraph: JsonLdGraph = {
        "@context": {
          dx: "https://discovery-x.app/ns/",
          mx: "https://discovery-x.app/ns/matrix/",
        },
        "@graph": [
          { "@id": "mx:unknown/test", "@type": "mx:Unknown", "mx:name": "잘못된 타입" },
        ],
      };
      const result = validateGraph(invalidGraph);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("허용되지 않는 @type"))).toBe(true);
    });
  });
});
