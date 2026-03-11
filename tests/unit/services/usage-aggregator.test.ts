/**
 * UsageAggregator 단위 테스트
 *
 * 대상: app/features/cost/service/usage-aggregator.ts
 * - backfill: 최근 N일 daily_usage_aggregates 재집계
 * - DELETE + re-INSERT 전략 검증
 * - 복수 tenant/provider/purpose 그룹핑
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "tests/helpers/db";
import type { DB } from "~/db";
import { UsageAggregator } from "~/features/cost/service/usage-aggregator";
import {
  usageEvents,
  dailyUsageAggregates,
} from "~/features/cost/db/schema";
import { eq } from "drizzle-orm";

let db: ReturnType<typeof createTestDb>;
let aggregator: UsageAggregator;

const TENANT = "t-agg-1";
const USER_A = "u-agg-a";
const USER_B = "u-agg-b";

function unixOf(daysAgo: number): number {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(12, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

function dateStrOf(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

beforeEach(() => {
  db = createTestDb();
  aggregator = new UsageAggregator(db as unknown as DB);
});

describe("UsageAggregator", () => {
  // ============================================================================
  // 기본 집계
  // ============================================================================

  it("usage_events가 없으면 빈 결과를 반환해요", async () => {
    const result = await aggregator.backfill(7);

    expect(result.rowsDeleted).toBe(0);
    expect(result.rowsInserted).toBe(0);
    expect(result.daysProcessed).toBe(0);
  });

  it("단일 날짜의 이벤트를 올바르게 집계해요", async () => {
    // 오늘 이벤트 2건 삽입
    insertEvent(db, {
      tenantId: TENANT,
      userId: USER_A,
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      purpose: "chat",
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      latencyMs: 200,
      createdAt: unixOf(0),
    });
    insertEvent(db, {
      tenantId: TENANT,
      userId: USER_A,
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      purpose: "chat",
      inputTokens: 300,
      outputTokens: 150,
      totalTokens: 450,
      latencyMs: 400,
      createdAt: unixOf(0),
    });

    const result = await aggregator.backfill(1);

    expect(result.rowsInserted).toBe(1);
    expect(result.daysProcessed).toBe(1);

    const aggs = db.select().from(dailyUsageAggregates).all();
    expect(aggs).toHaveLength(1);
    expect(aggs[0].requestCount).toBe(2);
    expect(aggs[0].totalInputTokens).toBe(400);
    expect(aggs[0].totalOutputTokens).toBe(200);
    expect(aggs[0].totalTokens).toBe(600);
    expect(aggs[0].avgLatencyMs).toBe(300); // (200+400)/2
    expect(aggs[0].tenantId).toBe(TENANT);
    expect(aggs[0].userId).toBe(USER_A);
  });

  // ============================================================================
  // 다중 그룹핑
  // ============================================================================

  it("다른 사용자/프로바이더/용도는 별도 행으로 집계해요", async () => {
    // User A - anthropic - chat
    insertEvent(db, {
      tenantId: TENANT,
      userId: USER_A,
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      purpose: "chat",
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      createdAt: unixOf(0),
    });
    // User A - openai - analysis (다른 프로바이더+용도)
    insertEvent(db, {
      tenantId: TENANT,
      userId: USER_A,
      provider: "openai",
      model: "gpt-4o-mini",
      purpose: "analysis",
      inputTokens: 200,
      outputTokens: 100,
      totalTokens: 300,
      createdAt: unixOf(0),
    });
    // User B - anthropic - chat (다른 사용자)
    insertEvent(db, {
      tenantId: TENANT,
      userId: USER_B,
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      purpose: "chat",
      inputTokens: 50,
      outputTokens: 25,
      totalTokens: 75,
      createdAt: unixOf(0),
    });

    const result = await aggregator.backfill(1);

    expect(result.rowsInserted).toBe(3);
    expect(result.daysProcessed).toBe(1);

    const aggs = db.select().from(dailyUsageAggregates).all();
    expect(aggs).toHaveLength(3);
  });

  // ============================================================================
  // 다중 날짜
  // ============================================================================

  it("여러 날짜의 이벤트를 날짜별로 분리 집계해요", async () => {
    // 오늘
    insertEvent(db, {
      tenantId: TENANT,
      userId: USER_A,
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      purpose: "chat",
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      createdAt: unixOf(0),
    });
    // 어제
    insertEvent(db, {
      tenantId: TENANT,
      userId: USER_A,
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      purpose: "chat",
      inputTokens: 200,
      outputTokens: 100,
      totalTokens: 300,
      createdAt: unixOf(1),
    });
    // 3일 전
    insertEvent(db, {
      tenantId: TENANT,
      userId: USER_A,
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      purpose: "chat",
      inputTokens: 50,
      outputTokens: 25,
      totalTokens: 75,
      createdAt: unixOf(3),
    });

    const result = await aggregator.backfill(7);

    expect(result.rowsInserted).toBe(3);
    expect(result.daysProcessed).toBe(3);

    const aggs = db
      .select()
      .from(dailyUsageAggregates)
      .all();
    expect(aggs).toHaveLength(3);
  });

  // ============================================================================
  // 기존 집계 교체 (drift 보정)
  // ============================================================================

  it("기존 집계가 있으면 삭제 후 재생성해요 (drift 보정)", async () => {
    const today = dateStrOf(0);

    // 기존 잘못된 집계 삽입 (drift 상태)
    db.insert(dailyUsageAggregates)
      .values({
        id: "old-agg-1",
        tenantId: TENANT,
        userId: USER_A,
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        purpose: "chat",
        date: today,
        requestCount: 999, // 잘못된 값
        totalInputTokens: 99999,
        totalOutputTokens: 99999,
        totalTokens: 199998,
      })
      .run();

    // 실제 이벤트 1건
    insertEvent(db, {
      tenantId: TENANT,
      userId: USER_A,
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      purpose: "chat",
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      createdAt: unixOf(0),
    });

    const result = await aggregator.backfill(1);

    expect(result.rowsDeleted).toBe(1);
    expect(result.rowsInserted).toBe(1);

    const aggs = db.select().from(dailyUsageAggregates).all();
    expect(aggs).toHaveLength(1);
    expect(aggs[0].requestCount).toBe(1);
    expect(aggs[0].totalInputTokens).toBe(100);
    expect(aggs[0].id).not.toBe("old-agg-1"); // 새 ID
  });

  // ============================================================================
  // 범위 밖 이벤트 제외
  // ============================================================================

  it("백필 범위 밖의 이벤트는 집계에 포함하지 않아요", async () => {
    // 10일 전 이벤트 (7일 범위 밖)
    insertEvent(db, {
      tenantId: TENANT,
      userId: USER_A,
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      purpose: "chat",
      inputTokens: 999,
      outputTokens: 999,
      totalTokens: 1998,
      createdAt: unixOf(10),
    });
    // 오늘 이벤트 (범위 내)
    insertEvent(db, {
      tenantId: TENANT,
      userId: USER_A,
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      purpose: "chat",
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      createdAt: unixOf(0),
    });

    const result = await aggregator.backfill(7);

    expect(result.rowsInserted).toBe(1);

    const aggs = db.select().from(dailyUsageAggregates).all();
    expect(aggs).toHaveLength(1);
    expect(aggs[0].totalInputTokens).toBe(100); // 10일 전 999는 제외
  });

  // ============================================================================
  // days 파라미터
  // ============================================================================

  it("days=1이면 당일만 집계해요", async () => {
    insertEvent(db, {
      tenantId: TENANT,
      userId: USER_A,
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      purpose: "chat",
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      createdAt: unixOf(0),
    });
    insertEvent(db, {
      tenantId: TENANT,
      userId: USER_A,
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      purpose: "chat",
      inputTokens: 200,
      outputTokens: 100,
      totalTokens: 300,
      createdAt: unixOf(1),
    });

    const result = await aggregator.backfill(1);

    expect(result.rowsInserted).toBe(1);

    const aggs = db.select().from(dailyUsageAggregates).all();
    expect(aggs).toHaveLength(1);
    expect(aggs[0].totalInputTokens).toBe(100); // 당일만
  });

  // ============================================================================
  // latencyMs null 처리
  // ============================================================================

  it("latencyMs가 null인 이벤트도 정상 집계해요", async () => {
    insertEvent(db, {
      tenantId: TENANT,
      userId: USER_A,
      provider: "openai",
      model: "gpt-4o-mini",
      purpose: "batch",
      inputTokens: 500,
      outputTokens: 200,
      totalTokens: 700,
      latencyMs: null,
      createdAt: unixOf(0),
    });

    const result = await aggregator.backfill(1);

    expect(result.rowsInserted).toBe(1);

    const aggs = db.select().from(dailyUsageAggregates).all();
    expect(aggs[0].avgLatencyMs).toBeNull();
  });

  // ============================================================================
  // 범위 밖 기존 집계 보존
  // ============================================================================

  it("백필 범위 밖의 기존 집계는 삭제하지 않아요", async () => {
    // 30일 전 집계 (7일 범위 밖)
    db.insert(dailyUsageAggregates)
      .values({
        id: "old-preserved",
        tenantId: TENANT,
        userId: USER_A,
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        purpose: "chat",
        date: dateStrOf(30),
        requestCount: 10,
        totalInputTokens: 1000,
        totalOutputTokens: 500,
        totalTokens: 1500,
      })
      .run();

    const result = await aggregator.backfill(7);

    // 범위 밖 집계는 보존
    const preserved = db
      .select()
      .from(dailyUsageAggregates)
      .where(eq(dailyUsageAggregates.id, "old-preserved"))
      .all();
    expect(preserved).toHaveLength(1);
    expect(preserved[0].requestCount).toBe(10);
  });
});

// ============================================================================
// Helper
// ============================================================================

function insertEvent(
  db: ReturnType<typeof createTestDb>,
  data: {
    tenantId: string;
    userId: string;
    provider: string;
    model: string;
    purpose: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    latencyMs?: number | null;
    createdAt: number;
  }
) {
  db.insert(usageEvents)
    .values({
      id: crypto.randomUUID(),
      tenantId: data.tenantId,
      userId: data.userId,
      provider: data.provider,
      model: data.model,
      purpose: data.purpose,
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: data.totalTokens,
      latencyMs: data.latencyMs ?? null,
      toolRounds: 0,
      createdAt: new Date(data.createdAt * 1000),
    })
    .run();
}
