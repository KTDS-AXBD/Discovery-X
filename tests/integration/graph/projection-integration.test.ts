/**
 * ProjectionBuilder 통합 테스트
 *
 * GraphStore로 실제 Graph를 생성/업데이트한 뒤,
 * ProjectionBuilder가 올바르게 Projection을 동기화하는지 검증한다.
 * 단위 테스트와 달리, GraphStore + ProjectionBuilder의 연동 플로우에 집중.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDB } from "../../helpers/db";
import { GraphStore } from "~/lib/graph/store";
import { ProjectionBuilder } from "~/lib/graph/projection";
import type { DB } from "~/db";
import type { JsonLdGraph, ScopeType } from "~/lib/graph/types";

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

// ─── 테스트 데이터 ─────────────────────────────────────────────────────

const orgGraphWithUsers: JsonLdGraph = {
  "@context": { dx: "https://discovery-x.io/ns/" },
  "@graph": [
    { "@id": "dx:user-1", "@type": "dx:User", "dx:name": "김대표", "dx:role": "CEO" },
    { "@id": "dx:exp-1", "@type": "dx:Expertise", "dx:label": "전략기획", "dx:level": "상" },
    { "@id": "dx:pref-1", "@type": "dx:Preference", "dx:label": "AI/ML 트렌드" },
  ],
};

const userGraphData: JsonLdGraph = {
  "@context": { dx: "https://discovery-x.io/ns/" },
  "@graph": [
    { "@id": "dx:user-1", "@type": "dx:User", "dx:name": "이개발", "dx:role": "풀스택개발자" },
    { "@id": "dx:exp-1", "@type": "dx:Expertise", "dx:label": "TypeScript", "dx:level": "상" },
    { "@id": "dx:exp-2", "@type": "dx:Expertise", "dx:label": "React" },
  ],
};

const topicGraphData: JsonLdGraph = {
  "@context": { dx: "https://discovery-x.io/ns/" },
  "@graph": [
    {
      "@id": "dx:topic-1",
      "@type": "dx:Topic",
      "dx:name": "에이전트 경제",
      "dx:description": "AI 에이전트 기반 새로운 경제 모델",
    },
    { "@id": "dx:dec-1", "@type": "dx:Decision", "dx:summary": "PoC 착수 결정", "dx:date": "2026-02-15" },
  ],
};

// ─── 테스트 ─────────────────────────────────────────────────────────────

describe("ProjectionBuilder 통합 테스트", () => {
  let db: TestDB;
  let store: GraphStore;
  let builder: ProjectionBuilder;

  beforeEach(() => {
    db = createTestDb();
    store = new GraphStore(asDB(db));
    builder = new ProjectionBuilder(asDB(db));
  });

  // ─── syncProjection ──────────────────────────────────────────────────

  describe("syncProjection", () => {
    it("org scope Graph → SOUL.md Projection 생성", async () => {
      await store.create({
        scopeType: "org",
        scopeId: "org-soul-1",
        jsonld: orgGraphWithUsers,
        contentHash: "",
      });

      const synced = await builder.syncProjection("org", "org-soul-1");
      expect(synced).toBe(true);

      const proj = await builder.getProjection("org", "org-soul-1", "SOUL.md");
      expect(proj).not.toBeNull();
      expect(proj!.projType).toBe("SOUL.md");
      expect(proj!.content).toContain("## 성격");
      expect(proj!.content).toContain("## 원칙");
      expect(proj!.content).toContain("## 사용자 맥락");
      expect(proj!.content).toContain("김대표");
      expect(proj!.content).toContain("전략기획");
    });

    it("user scope Graph → USER.md Projection 생성", async () => {
      await store.create({
        scopeType: "user",
        scopeId: "user-proj-1",
        jsonld: userGraphData,
        contentHash: "",
      });

      const synced = await builder.syncProjection("user", "user-proj-1");
      expect(synced).toBe(true);

      const proj = await builder.getProjection("user", "user-proj-1", "USER.md");
      expect(proj).not.toBeNull();
      expect(proj!.projType).toBe("USER.md");
      expect(proj!.content).toContain("## 사용자 프로필");
      expect(proj!.content).toContain("이개발");
      expect(proj!.content).toContain("풀스택개발자");
      expect(proj!.content).toContain("TypeScript");
      expect(proj!.content).toContain("(상)");
      expect(proj!.content).toContain("React");
    });

    it("topic scope Graph → TOPIC.md Projection 생성", async () => {
      await store.create({
        scopeType: "topic",
        scopeId: "topic-proj-1",
        jsonld: topicGraphData,
        contentHash: "",
      });

      const synced = await builder.syncProjection("topic", "topic-proj-1");
      expect(synced).toBe(true);

      const proj = await builder.getProjection("topic", "topic-proj-1", "TOPIC.md");
      expect(proj).not.toBeNull();
      expect(proj!.content).toContain("에이전트 경제");
      expect(proj!.content).toContain("PoC 착수 결정");
      expect(proj!.content).toContain("(2026-02-15)");
    });

    it("Graph 업데이트 후 재동기화 시 Projection 내용 반영", async () => {
      // 1. 초기 Graph + Projection 생성
      const created = await store.create({
        scopeType: "user",
        scopeId: "user-resync",
        jsonld: makeJsonLd([
          { "dx:name": "초기이름", "dx:role": "인턴" },
        ]),
        contentHash: "",
      });

      await builder.syncProjection("user", "user-resync");

      const projV1 = await builder.getProjection("user", "user-resync", "USER.md");
      expect(projV1!.content).toContain("초기이름");
      expect(projV1!.content).toContain("인턴");

      // 2. Graph 업데이트 (이름/역할 변경)
      await store.update(
        created.id,
        makeJsonLd([{ "dx:name": "변경이름", "dx:role": "시니어" }]),
        "역할 승진",
      );

      // 3. 재동기화 → 새 내용이 반영되어야 함
      const resynced = await builder.syncProjection("user", "user-resync");
      expect(resynced).toBe(true);

      const projV2 = await builder.getProjection("user", "user-resync", "USER.md");
      expect(projV2!.content).toContain("변경이름");
      expect(projV2!.content).toContain("시니어");
      expect(projV2!.content).not.toContain("초기이름");
    });

    it("hash 동일 시 재동기화 스킵 (false 반환)", async () => {
      await store.create({
        scopeType: "user",
        scopeId: "user-skip",
        jsonld: userGraphData,
        contentHash: "",
      });

      // 첫 동기화
      const first = await builder.syncProjection("user", "user-skip");
      expect(first).toBe(true);

      // 동일 hash로 재동기화 → 스킵
      const second = await builder.syncProjection("user", "user-skip");
      expect(second).toBe(false);
    });

    it("빈 Graph(@graph 빈 배열)는 기본 템플릿 Projection 생성", async () => {
      await store.create({
        scopeType: "user",
        scopeId: "user-empty",
        jsonld: makeJsonLd([]), // 빈 @graph
        contentHash: "",
      });

      const synced = await builder.syncProjection("user", "user-empty");
      expect(synced).toBe(true);

      const proj = await builder.getProjection("user", "user-empty", "USER.md");
      expect(proj).not.toBeNull();
      // 빈 Graph여도 기본 섹션 헤더는 포함
      expect(proj!.content).toContain("## 사용자 프로필");
      expect(proj!.content).toContain("## 전문 분야");
      expect(proj!.content).toContain("(등록된 전문 분야 없음)");
      expect(proj!.content).toContain("## 관심 분야");
      expect(proj!.content).toContain("(등록된 관심 분야 없음)");
    });
  });

  // ─── getProjection ───────────────────────────────────────────────────

  describe("getProjection", () => {
    it("존재하는 Projection 반환", async () => {
      await store.create({
        scopeType: "topic",
        scopeId: "topic-get-1",
        jsonld: topicGraphData,
        contentHash: "",
      });
      await builder.syncProjection("topic", "topic-get-1");

      const proj = await builder.getProjection("topic", "topic-get-1", "TOPIC.md");

      expect(proj).not.toBeNull();
      expect(proj!.scopeType).toBe("topic");
      expect(proj!.scopeId).toBe("topic-get-1");
      expect(proj!.projType).toBe("TOPIC.md");
      expect(proj!.graphVersion).toBe(1);
      expect(proj!.sourceHash).toBeTruthy();
    });

    it("존재하지 않는 Projection은 null", async () => {
      const proj = await builder.getProjection("user", "non-existent", "USER.md");
      expect(proj).toBeNull();
    });

    it("다른 projType으로 조회 시 null", async () => {
      await store.create({
        scopeType: "user",
        scopeId: "user-wrong-type",
        jsonld: userGraphData,
        contentHash: "",
      });
      await builder.syncProjection("user", "user-wrong-type");

      // USER.md Projection은 존재하지만 TOPIC.md로 조회하면 null
      const proj = await builder.getProjection("user", "user-wrong-type", "TOPIC.md");
      expect(proj).toBeNull();
    });
  });

  // ─── Graph 없는 경우 ──────────────────────────────────────────────────

  describe("Graph 없는 경우", () => {
    it("syncProjection — Graph 없으면 false 반환", async () => {
      const result = await builder.syncProjection("user", "no-graph");
      expect(result).toBe(false);
    });
  });

  // ─── Projection graphVersion 추적 ─────────────────────────────────────

  describe("graphVersion 추적", () => {
    it("Graph 업데이트 후 Projection의 graphVersion도 갱신", async () => {
      const created = await store.create({
        scopeType: "user",
        scopeId: "user-ver-track",
        jsonld: userGraphData,
        contentHash: "",
      });

      await builder.syncProjection("user", "user-ver-track");
      const projV1 = await builder.getProjection("user", "user-ver-track", "USER.md");
      expect(projV1!.graphVersion).toBe(1);

      // Graph 업데이트
      await store.update(
        created.id,
        makeJsonLd([{ "dx:name": "업데이트됨", "dx:role": "리드" }]),
      );

      await builder.syncProjection("user", "user-ver-track");
      const projV2 = await builder.getProjection("user", "user-ver-track", "USER.md");
      expect(projV2!.graphVersion).toBe(2);
    });
  });
});
