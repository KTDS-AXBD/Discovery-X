import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDB } from "../helpers/db";
import { users } from "~/db/schema";
import {
  sharedSignals,
  topics,
  topicMembers,
  graphs,
} from "~/db/schema-v2";
import { SignalRouter } from "~/lib/integration/signal-router";

describe("SignalRouter", () => {
  let db: TestDB;
  let router: SignalRouter;

  beforeEach(() => {
    db = createTestDb();
    router = new SignalRouter(db as never);

    // 기본 시드 데이터
    db.insert(users)
      .values([
        { id: "u1", email: "u1@test.com", name: "User 1" },
        { id: "u2", email: "u2@test.com", name: "User 2" },
      ])
      .run();

    db.insert(topics)
      .values({
        id: "t1",
        teamId: "team1",
        name: "AI Research",
        createdBy: "u1",
      })
      .run();

    db.insert(topicMembers)
      .values([
        { topicId: "t1", userId: "u1", role: "owner" },
        { topicId: "t1", userId: "u2", role: "editor" },
      ])
      .run();

    // 멤버의 Graph 시드 (expertise score 계산용)
    db.insert(graphs)
      .values([
        {
          id: "g-u1",
          scopeType: "user",
          scopeId: "u1",
          jsonld: JSON.stringify({
            "@context": {},
            "@graph": [
              {
                "@id": "node:ai",
                "@type": "dx:Concept",
                "dx:label": "AI Research",
                "dx:importance": 0.9,
              },
            ],
          }),
          contentHash: "hash1",
        },
        {
          id: "g-u2",
          scopeType: "user",
          scopeId: "u2",
          jsonld: JSON.stringify({
            "@context": {},
            "@graph": [
              {
                "@id": "node:market",
                "@type": "dx:Concept",
                "dx:label": "Market Analysis",
                "dx:importance": 0.7,
              },
            ],
          }),
          contentHash: "hash2",
        },
      ])
      .run();
  });

  // ─── routePendingSignals ──────────────────────────────────────────

  it("pending 시그널을 topic member에게 라우팅한다", async () => {
    db.insert(sharedSignals)
      .values({
        sourceUserId: "u1",
        teamId: "team1",
        topicId: "t1",
        contentSummary: "AI Research breakthrough in transformer models",
        score: 8.5,
        status: "pending",
      })
      .run();

    const result = await router.routePendingSignals();

    expect(result.processed).toBe(1);
    expect(result.routed).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(result.details).toHaveLength(1);
    expect(result.details[0].topicId).toBe("t1");
    // u1이 AI Research expertise가 높으므로 라우팅 대상
    expect(result.details[0].routedTo).toBe("u1");
  });

  it("topicId가 없는 시그널은 skip한다", async () => {
    db.insert(sharedSignals)
      .values({
        sourceUserId: "u1",
        teamId: "team1",
        topicId: null,
        contentSummary: "Orphan signal without topic",
        score: 5.0,
        status: "pending",
      })
      .run();

    const result = await router.routePendingSignals();

    expect(result.processed).toBe(1);
    expect(result.routed).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it("이미 reviewed인 시그널은 처리하지 않는다", async () => {
    db.insert(sharedSignals)
      .values({
        sourceUserId: "u1",
        teamId: "team1",
        topicId: "t1",
        contentSummary: "Already reviewed signal",
        score: 7.0,
        status: "reviewed",
        routedTo: "u2",
      })
      .run();

    const result = await router.routePendingSignals();
    expect(result.processed).toBe(0);
  });

  it("여러 pending 시그널을 일괄 처리한다", async () => {
    db.insert(sharedSignals)
      .values([
        {
          sourceUserId: "u1",
          teamId: "team1",
          topicId: "t1",
          contentSummary: "Signal A",
          score: 9.0,
          status: "pending",
        },
        {
          sourceUserId: "u2",
          teamId: "team1",
          topicId: "t1",
          contentSummary: "Signal B",
          score: 6.0,
          status: "pending",
        },
      ])
      .run();

    const result = await router.routePendingSignals();

    expect(result.processed).toBe(2);
    expect(result.routed).toBe(2);
  });

  // ─── getRoutingStats ──────────────────────────────────────────────

  it("시그널 상태별 통계를 반환한다", async () => {
    db.insert(sharedSignals)
      .values([
        {
          sourceUserId: "u1",
          teamId: "team1",
          topicId: "t1",
          contentSummary: "Pending",
          score: 5.0,
          status: "pending",
        },
        {
          sourceUserId: "u1",
          teamId: "team1",
          topicId: "t1",
          contentSummary: "Reviewed",
          score: 6.0,
          status: "reviewed",
          routedTo: "u2",
        },
        {
          sourceUserId: "u1",
          teamId: "team1",
          topicId: "t1",
          contentSummary: "Dismissed",
          score: 3.0,
          status: "dismissed",
        },
      ])
      .run();

    const stats = await router.getRoutingStats();

    expect(stats.pending).toBe(1);
    expect(stats.reviewed).toBe(1);
    expect(stats.dismissed).toBe(1);
    expect(stats.total).toBe(3);
  });

  it("시그널이 없으면 모두 0을 반환한다", async () => {
    const stats = await router.getRoutingStats();

    expect(stats.pending).toBe(0);
    expect(stats.reviewed).toBe(0);
    expect(stats.total).toBe(0);
  });
});
