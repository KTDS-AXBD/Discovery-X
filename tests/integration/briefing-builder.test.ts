import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDB } from "../helpers/db";
import { users, discoveries, radarSources, radarItems } from "~/db/schema";
import {
  topics,
  topicMembers,
  graphs,
  projections,
} from "~/db/schema-v2";
import { BriefingBuilder } from "~/lib/integration/briefing-builder";

describe("BriefingBuilder", () => {
  let db: TestDB;
  let builder: BriefingBuilder;

  beforeEach(() => {
    db = createTestDb();
    builder = new BriefingBuilder(db as never);

    const now = new Date();
    const recentTime = new Date(now.getTime() - 2 * 60 * 60 * 1000); // 2시간 전
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

    // ─── 시드 데이터 ─────────────────────────────────────────────────

    // users
    db.insert(users)
      .values([
        { id: "u1", email: "u1@test.com", name: "User 1", role: "user" },
        { id: "u2", email: "u2@test.com", name: "User 2", role: "user" },
      ])
      .run();

    // radarSources (radarItems FK)
    db.insert(radarSources)
      .values({
        id: "src1",
        name: "Tech News",
        sourceType: "rss",
        url: "https://example.com/rss",
      })
      .run();

    // radarItems (최근 24시간 내, relevanceScore >= 7)
    db.insert(radarItems)
      .values([
        {
          id: "ri1",
          sourceId: "src1",
          urlHash: "hash1",
          url: "https://example.com/1",
          title: "LLM 혁신: GPT-5 공개",
          summary: "OpenAI가 새로운 모델을 공개했다",
          relevanceScore: 9,
          collectedAt: recentTime,
        },
        {
          id: "ri2",
          sourceId: "src1",
          urlHash: "hash2",
          url: "https://example.com/2",
          title: "클라우드 시장 동향",
          summary: "AWS와 GCP의 시장 점유율 변화",
          relevanceScore: 7,
          collectedAt: recentTime,
        },
        {
          id: "ri3",
          sourceId: "src1",
          urlHash: "hash3",
          url: "https://example.com/3",
          title: "오래된 뉴스",
          summary: "2주 전 뉴스",
          relevanceScore: 8,
          collectedAt: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000), // 14일 전
        },
      ])
      .run();

    // discoveries (최근 업데이트)
    db.insert(discoveries)
      .values([
        {
          id: "d1",
          title: "AI 자동화 탐색",
          seedSummary: "내부 프로세스 자동화",
          sourceType: "article",
          status: "HYPOTHESIS",
          ownerId: "u1",
          updatedAt: recentTime,
        },
        {
          id: "d2",
          title: "오래된 Discovery",
          seedSummary: "지난달 업데이트",
          sourceType: "issue",
          status: "DISCOVERY",
          ownerId: "u2",
          updatedAt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
        },
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
      .values({ topicId: "t1", userId: "u1", role: "owner" })
      .run();

    // graphs (topic scope — Decision 노드 포함)
    db.insert(graphs)
      .values({
        id: "g-t1",
        scopeType: "topic",
        scopeId: "t1",
        jsonld: JSON.stringify({
          "@context": {},
          "@graph": [
            {
              "@id": "dx:topic-t1",
              "@type": "dx:Topic",
              "dx:name": "AI Research",
            },
            {
              "@id": "dx:decision-1",
              "@type": "dx:Decision",
              "dx:summary": "LLM 실험 승인",
              "dx:date": threeDaysAgo.toISOString().slice(0, 10),
            },
            {
              "@id": "dx:decision-2",
              "@type": "dx:Decision",
              "dx:summary": "오래된 결정",
              "dx:date": "2025-01-01",
            },
          ],
        }),
        contentHash: "hash-t1",
      })
      .run();
  });

  // ─── buildBriefing ──────────────────────────────────────────────────

  describe("buildBriefing", () => {
    it("마크다운 브리핑 문자열을 반환한다", async () => {
      const briefing = await builder.buildBriefing("u1");

      expect(typeof briefing).toBe("string");
      expect(briefing).toContain("## 일간 브리핑");
    });

    it("주요 시그널 섹션에 최근 고점수 Radar 아이템을 포함한다", async () => {
      const briefing = await builder.buildBriefing("u1");

      expect(briefing).toContain("### 주요 시그널");
      expect(briefing).toContain("LLM 혁신: GPT-5 공개");
      expect(briefing).toContain("클라우드 시장 동향");
      // 14일 전 뉴스는 24시간 필터에 걸려 미포함
      expect(briefing).not.toContain("오래된 뉴스");
    });

    it("파이프라인 변경 섹션에 최근 Discovery 변경을 포함한다", async () => {
      const briefing = await builder.buildBriefing("u1");

      expect(briefing).toContain("### 파이프라인 변경");
      expect(briefing).toContain("AI 자동화 탐색");
      expect(briefing).toContain("HYPOTHESIS");
      // 30일 전 업데이트는 미포함
      expect(briefing).not.toContain("오래된 Discovery");
    });

    it("최근 결정 섹션에 7일 내 Decision을 포함한다", async () => {
      const briefing = await builder.buildBriefing("u1");

      expect(briefing).toContain("### 최근 결정");
      expect(briefing).toContain("LLM 실험 승인");
      expect(briefing).toContain("AI Research");
      // 2025년 결정은 7일 밖이므로 미포함
      expect(briefing).not.toContain("오래된 결정");
    });

    it("데이터가 없는 사용자에게도 빈 섹션 구조를 반환한다", async () => {
      const briefing = await builder.buildBriefing("u2");

      expect(briefing).toContain("## 일간 브리핑");
      // u2는 topic 멤버가 아니므로 결정 섹션이 비어 있음
      expect(briefing).toContain("(최근 결정 없음)");
    });
  });

  // ─── refreshBriefingProjection ──────────────────────────────────────

  describe("refreshBriefingProjection", () => {
    it("projections 테이블에 BRIEFING.md를 삽입한다", async () => {
      await builder.refreshBriefingProjection("u1");

      const row = db
        .select()
        .from(projections)
        .get();

      expect(row).not.toBeNull();
      expect(row!.scopeType).toBe("user");
      expect(row!.scopeId).toBe("u1");
      expect(row!.projType).toBe("BRIEFING.md");
      expect(row!.content).toContain("## 일간 브리핑");
    });

    it("동일 사용자의 브리핑을 다시 갱신하면 upsert(update)한다", async () => {
      await builder.refreshBriefingProjection("u1");
      await builder.refreshBriefingProjection("u1");

      const rows = db
        .select()
        .from(projections)
        .all();

      // upsert이므로 1개만 존재
      expect(rows.length).toBe(1);
      expect(rows[0].projType).toBe("BRIEFING.md");
    });

    it("다른 사용자의 브리핑은 별도 row로 저장한다", async () => {
      await builder.refreshBriefingProjection("u1");
      await builder.refreshBriefingProjection("u2");

      const rows = db
        .select()
        .from(projections)
        .all();

      expect(rows.length).toBe(2);
      const scopeIds = rows.map((r) => r.scopeId);
      expect(scopeIds).toContain("u1");
      expect(scopeIds).toContain("u2");
    });
  });
});
