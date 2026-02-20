/**
 * syncAllStale() 배치 동기화 테스트
 *
 * 테스트 대상: app/lib/graph/projection-sync.ts — syncAllStale()
 * Graph 테이블을 순회하며 stale Projection을 일괄 갱신하는 배치 로직 검증
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDB } from "../../helpers/db";
import { syncAllStale } from "~/lib/graph/projection-sync";
import { graphs, projections } from "~/db/schema-v2";
import { eq } from "drizzle-orm";
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
  jsonld: JsonLdGraph | string,
  contentHash = "hash-v1",
) {
  const jsonStr = typeof jsonld === "string" ? jsonld : JSON.stringify(jsonld);
  await db.insert(graphs).values({
    id: `g-${scopeType}-${scopeId}`,
    scopeType,
    scopeId,
    jsonld: jsonStr,
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
  ],
};

const topicGraph: JsonLdGraph = {
  "@context": { dx: "https://discovery-x.io/ns/" },
  "@graph": [
    { "@id": "dx:topic-1", "@type": "dx:Topic", "dx:name": "AI 에이전트 시장" },
    { "@id": "dx:dec-1", "@type": "dx:Decision", "dx:summary": "PoC 진행 결정" },
  ],
};

const orgGraph: JsonLdGraph = {
  "@context": { dx: "https://discovery-x.io/ns/" },
  "@graph": [
    { "@id": "dx:user-org", "@type": "dx:User", "dx:name": "팀장", "dx:role": "리드" },
  ],
};

// ─── 테스트 ─────────────────────────────────────────────────────────────

describe("syncAllStale (배치 동기화)", () => {
  let db: TestDB;

  beforeEach(() => {
    db = createTestDb();
  });

  // 1. Graph가 없으면 모두 0
  it("Graph가 없으면 { total:0, updated:0, skipped:0, errors:0 } 반환", async () => {
    const result = await syncAllStale(asDB(db));
    expect(result).toEqual({ total: 0, updated: 0, skipped: 0, errors: 0 });
  });

  // 2. Graph 1개 (Projection 없음) → updated:1
  it("Graph 1개, Projection 없음 → updated:1", async () => {
    await insertGraph(db, "user", "u-1", userGraph);

    const result = await syncAllStale(asDB(db));
    expect(result).toEqual({ total: 1, updated: 1, skipped: 0, errors: 0 });

    // Projection이 실제로 생성되었는지 확인
    const rows = await db.select().from(projections);
    expect(rows.length).toBe(1);
    expect(rows[0].scopeType).toBe("user");
    expect(rows[0].content).toContain("김철수");
  });

  // 3. Graph 2개 + Projection 이미 최신 (hash 일치) → skipped:2
  it("Graph 2개, Projection 모두 최신 → skipped:2", async () => {
    await insertGraph(db, "user", "u-1", userGraph, "hash-a");
    await insertGraph(db, "topic", "t-1", topicGraph, "hash-b");

    // 첫 동기화: 2개 생성
    const first = await syncAllStale(asDB(db));
    expect(first.updated).toBe(2);

    // 두 번째 동기화: hash 동일하므로 모두 스킵
    const second = await syncAllStale(asDB(db));
    expect(second).toEqual({ total: 2, updated: 0, skipped: 2, errors: 0 });
  });

  // 4. Graph 3개: 1개 최신 + 1개 stale + 1개 신규 → updated:2, skipped:1
  it("Graph 3개 혼합: 최신 1 + stale 1 + 신규 1 → updated:2, skipped:1", async () => {
    await insertGraph(db, "user", "u-1", userGraph, "hash-a");
    await insertGraph(db, "topic", "t-1", topicGraph, "hash-b");

    // 첫 동기화: 2개 생성
    await syncAllStale(asDB(db));

    // user u-1의 hash 변경 (stale)
    await db
      .update(graphs)
      .set({ contentHash: "hash-a-v2" })
      .where(eq(graphs.id, "g-user-u-1"));

    // 신규 Graph 추가
    await insertGraph(db, "org", "o-1", orgGraph, "hash-c");

    // 두 번째 동기화
    const result = await syncAllStale(asDB(db));
    expect(result).toEqual({ total: 3, updated: 2, skipped: 1, errors: 0 });
  });

  // 5. scopeType 다양한 경우 (user, topic, org) 모두 처리
  it("scopeType이 다양해도 (user, topic, org) 모두 처리", async () => {
    await insertGraph(db, "user", "u-1", userGraph);
    await insertGraph(db, "topic", "t-1", topicGraph);
    await insertGraph(db, "org", "o-1", orgGraph);

    const result = await syncAllStale(asDB(db));
    expect(result.total).toBe(3);
    expect(result.updated).toBe(3);
    expect(result.errors).toBe(0);

    // 각 scopeType별 Projection 존재 확인
    const userProj = await db
      .select()
      .from(projections)
      .where(eq(projections.scopeType, "user"));
    const topicProj = await db
      .select()
      .from(projections)
      .where(eq(projections.scopeType, "topic"));
    const orgProj = await db
      .select()
      .from(projections)
      .where(eq(projections.scopeType, "org"));

    expect(userProj.length).toBe(1);
    expect(topicProj.length).toBe(1);
    expect(orgProj.length).toBe(1);
  });

  // 6. JSON-LD 파싱 에러 시 errors 카운트 증가
  it("malformed jsonld → errors 카운트 증가, 나머지는 정상 처리", async () => {
    await insertGraph(db, "user", "u-ok", userGraph);
    // malformed JSON → JSON.parse() 에서 throw
    await insertGraph(db, "topic", "t-bad", "{{not valid json" as unknown as JsonLdGraph);

    const result = await syncAllStale(asDB(db));
    expect(result.total).toBe(2);
    expect(result.updated).toBe(1);
    expect(result.errors).toBe(1);
  });

  // 7. 대량 Graph (10개) 배치 처리
  it("대량 Graph 10개 배치 처리 정상", async () => {
    for (let i = 0; i < 10; i++) {
      const graph: JsonLdGraph = {
        "@context": { dx: "https://discovery-x.io/ns/" },
        "@graph": [
          { "@id": `dx:user-${i}`, "@type": "dx:User", "dx:name": `사용자${i}` },
        ],
      };
      await insertGraph(db, "user", `u-${i}`, graph, `hash-${i}`);
    }

    const result = await syncAllStale(asDB(db));
    expect(result).toEqual({ total: 10, updated: 10, skipped: 0, errors: 0 });

    const allProj = await db.select().from(projections);
    expect(allProj.length).toBe(10);
  });

  // 8. 동일 scope에 대해 2번 호출 시 두 번째는 모두 스킵
  it("동일 scope에 대해 2번 호출 → 두 번째는 모두 스킵", async () => {
    await insertGraph(db, "user", "u-1", userGraph, "hash-fixed");
    await insertGraph(db, "topic", "t-1", topicGraph, "hash-fixed-2");

    const first = await syncAllStale(asDB(db));
    expect(first).toEqual({ total: 2, updated: 2, skipped: 0, errors: 0 });

    const second = await syncAllStale(asDB(db));
    expect(second).toEqual({ total: 2, updated: 0, skipped: 2, errors: 0 });

    // Projection 수는 여전히 2개 (중복 생성 없음)
    const allProj = await db.select().from(projections);
    expect(allProj.length).toBe(2);
  });
});
