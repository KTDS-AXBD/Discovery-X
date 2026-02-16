/**
 * ProjectionBuilder 테스트
 *
 * 테스트 대상:
 * - syncProjection(): Graph → Projection 동기화 (생성/스킵/업데이트)
 * - getProjection(): scope별 Projection 조회
 * - USER.md 템플릿: dx:User, dx:Expertise 노드 → Markdown 렌더링
 * - TOPIC.md 템플릿: dx:Topic, dx:Decision 노드 → Markdown 렌더링
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDB } from "../../helpers/db";
import { ProjectionBuilder } from "~/lib/graph/projection";
import { graphs } from "~/db/schema-v2";
import type { DB } from "~/db";
import type { JsonLdGraph } from "~/lib/graph/types";

// ─── 헬퍼 ──────────────────────────────────────────────────────────────

function asDB(db: TestDB) {
  return db as unknown as DB;
}

/** graphs 테이블에 직접 삽입 */
async function insertGraph(
  db: TestDB,
  scopeType: string,
  scopeId: string,
  jsonld: JsonLdGraph,
  contentHash = "hash-v1",
) {
  await db.insert(graphs).values({
    id: `g-${scopeType}-${scopeId}`,
    scopeType,
    scopeId,
    jsonld: JSON.stringify(jsonld),
    version: 1,
    contentHash,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

// ─── 테스트 데이터 ─────────────────────────────────────────────────────

const userGraph: JsonLdGraph = {
  "@context": { dx: "https://discovery-x.io/ns/" },
  "@graph": [
    { "@id": "dx:user-1", "@type": "dx:User", "dx:name": "김철수", "dx:role": "BD매니저" },
    { "@id": "dx:exp-1", "@type": "dx:Expertise", "dx:label": "AI/ML", "dx:level": "상" },
    { "@id": "dx:exp-2", "@type": "dx:Expertise", "dx:label": "핀테크" },
  ],
};

const topicGraph: JsonLdGraph = {
  "@context": { dx: "https://discovery-x.io/ns/" },
  "@graph": [
    {
      "@id": "dx:topic-1",
      "@type": "dx:Topic",
      "dx:name": "AI 에이전트 시장",
      "dx:description": "AI 에이전트 관련 시장 동향",
    },
    { "@id": "dx:dec-1", "@type": "dx:Decision", "dx:summary": "PoC 진행 결정", "dx:date": "2026-02-01" },
    { "@id": "dx:dec-2", "@type": "dx:Decision", "dx:summary": "파트너십 검토" },
  ],
};

// ─── 테스트 ─────────────────────────────────────────────────────────────

describe("ProjectionBuilder", () => {
  let db: TestDB;
  let builder: ProjectionBuilder;

  beforeEach(() => {
    db = createTestDb();
    builder = new ProjectionBuilder(asDB(db));
  });

  // ─── syncProjection ────────────────────────────────────────────────

  describe("syncProjection", () => {
    it("Graph 존재 시 Projection 생성 + true 반환", async () => {
      await insertGraph(db, "user", "u-1", userGraph);

      const result = await builder.syncProjection("user", "u-1");
      expect(result).toBe(true);

      // Projection이 생성되었는지 확인
      const proj = await builder.getProjection("user", "u-1", "USER.md");
      expect(proj).not.toBeNull();
      expect(proj!.content).toContain("김철수");
    });

    it("hash 동일 시 스킵 + false 반환", async () => {
      await insertGraph(db, "user", "u-2", userGraph, "hash-same");

      // 첫 번째 동기화
      await builder.syncProjection("user", "u-2");

      // 두 번째 동기화 — hash 동일하므로 스킵
      const result = await builder.syncProjection("user", "u-2");
      expect(result).toBe(false);
    });

    it("hash 변경 시 업데이트 + true 반환", async () => {
      await insertGraph(db, "user", "u-3", userGraph, "hash-v1");

      await builder.syncProjection("user", "u-3");

      // Graph의 contentHash 변경 시뮬레이션
      const { eq } = await import("drizzle-orm");
      await db
        .update(graphs)
        .set({
          contentHash: "hash-v2",
          jsonld: JSON.stringify({
            "@context": { dx: "https://discovery-x.io/ns/" },
            "@graph": [
              { "@id": "dx:user-1", "@type": "dx:User", "dx:name": "이영희", "dx:role": "CTO" },
            ],
          }),
        })
        .where(eq(graphs.id, "g-user-u-3"));

      const result = await builder.syncProjection("user", "u-3");
      expect(result).toBe(true);

      const proj = await builder.getProjection("user", "u-3", "USER.md");
      expect(proj!.content).toContain("이영희");
    });

    it("Graph 없으면 false 반환", async () => {
      const result = await builder.syncProjection("user", "non-existent");
      expect(result).toBe(false);
    });
  });

  // ─── getProjection ────────────────────────────────────────────────

  describe("getProjection", () => {
    it("존재하는 Projection 조회", async () => {
      await insertGraph(db, "topic", "t-1", topicGraph);
      await builder.syncProjection("topic", "t-1");

      const proj = await builder.getProjection("topic", "t-1", "TOPIC.md");
      expect(proj).not.toBeNull();
      expect(proj!.projType).toBe("TOPIC.md");
      expect(proj!.scopeType).toBe("topic");
    });

    it("미존재 Projection → null", async () => {
      const proj = await builder.getProjection("user", "no-user", "USER.md");
      expect(proj).toBeNull();
    });
  });

  // ─── USER.md 템플릿 ─────────────────────────────────────────────────

  describe("USER.md 템플릿", () => {
    it("dx:User, dx:Expertise 노드 → Markdown 렌더링", async () => {
      await insertGraph(db, "user", "u-md", userGraph);
      await builder.syncProjection("user", "u-md");

      const proj = await builder.getProjection("user", "u-md", "USER.md");
      expect(proj).not.toBeNull();

      const content = proj!.content;

      // 사용자 프로필 섹션
      expect(content).toContain("## 사용자 프로필");
      expect(content).toContain("김철수");
      expect(content).toContain("BD매니저");

      // 전문 분야 섹션
      expect(content).toContain("## 전문 분야");
      expect(content).toContain("AI/ML");
      expect(content).toContain("(상)"); // level이 있는 경우
      expect(content).toContain("핀테크");
    });
  });

  // ─── TOPIC.md 템플릿 ────────────────────────────────────────────────

  describe("TOPIC.md 템플릿", () => {
    it("dx:Topic, dx:Decision 노드 → Markdown 렌더링", async () => {
      await insertGraph(db, "topic", "t-md", topicGraph);
      await builder.syncProjection("topic", "t-md");

      const proj = await builder.getProjection("topic", "t-md", "TOPIC.md");
      expect(proj).not.toBeNull();

      const content = proj!.content;

      // 토픽 헤더
      expect(content).toContain("## 토픽: AI 에이전트 시장");
      expect(content).toContain("AI 에이전트 관련 시장 동향");

      // 주요 결정 섹션
      expect(content).toContain("## 주요 결정");
      expect(content).toContain("PoC 진행 결정");
      expect(content).toContain("(2026-02-01)"); // 날짜가 있는 결정
      expect(content).toContain("파트너십 검토");
    });
  });
});
