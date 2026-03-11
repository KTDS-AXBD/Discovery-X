/**
 * Crawl Queue 서비스 단위 테스트 (실 DB 기반)
 *
 * 대상: RadarService — enqueueSource, dequeueBatch, completeQueueItem,
 *       failQueueItem, getQueueStatus, cleanupQueue, getRecentFailedQueue
 * 커버: 큐 CRUD, 중복 큐잉 방지, stale 복구 [F3], 지수 백오프,
 *       소스 자동 상태 전환 (REVIEW/FAILED), TTL 정리 [R5]
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDB } from "tests/helpers/db";
import type { DB } from "~/db";
import { RadarService } from "~/features/radar/service/radar.service";
import { users, tenants, tenantMembers, radarSources } from "~/db";
import {
  radarCrawlQueue,
  CrawlQueueStatus,
} from "~/features/radar/db/schema";
import { eq } from "drizzle-orm";

// ─── 상수 ───────────────────────────────────────────────────────────────

const TENANT_ID = "t-queue-test";
const USER_ID = "user-queue-1";

// ─── Helpers ────────────────────────────────────────────────────────────

let db: TestDB;
let service: RadarService;

function asDB(d: TestDB) {
  return d as unknown as DB;
}

function insertSource(overrides: Partial<typeof radarSources.$inferInsert> = {}) {
  const id = overrides.id ?? crypto.randomUUID();
  db.insert(radarSources)
    .values({
      id,
      name: overrides.name ?? "Test Source",
      sourceType: overrides.sourceType ?? "rss",
      url: overrides.url ?? "https://example.com/rss",
      tenantId: TENANT_ID,
      userId: USER_ID,
      status: "ACTIVE",
      collectionType: "auto",
      crawlInterval: overrides.crawlInterval ?? 86400,
      lastCollectedAt: overrides.lastCollectedAt ?? null,
      consecutiveFailures: overrides.consecutiveFailures ?? 0,
      ...overrides,
    })
    .run();
  return id;
}

function insertQueueItem(overrides: Partial<typeof radarCrawlQueue.$inferInsert> = {}) {
  const id = overrides.id ?? crypto.randomUUID();
  db.insert(radarCrawlQueue)
    .values({
      id,
      sourceId: overrides.sourceId ?? "src-1",
      url: overrides.url ?? "https://example.com",
      status: overrides.status ?? CrawlQueueStatus.PENDING,
      tenantId: TENANT_ID,
      parserType: overrides.parserType ?? "rss",
      retryCount: overrides.retryCount ?? 0,
      maxRetries: overrides.maxRetries ?? 3,
      scheduledAt: overrides.scheduledAt ?? new Date(),
      startedAt: overrides.startedAt ?? null,
      completedAt: overrides.completedAt ?? null,
      nextRetryAt: overrides.nextRetryAt ?? null,
      failureCode: overrides.failureCode ?? null,
      error: overrides.error ?? null,
      ...overrides,
    })
    .run();
  return id;
}

// ─── Setup ──────────────────────────────────────────────────────────────

beforeEach(() => {
  db = createTestDb();
  service = new RadarService(asDB(db));

  db.insert(users)
    .values({ id: USER_ID, email: "queue@test.com", name: "Queue User", role: "admin" })
    .run();

  db.insert(tenants)
    .values({ id: TENANT_ID, name: "Queue Tenant", slug: "queue-test", ownerUserId: USER_ID })
    .run();

  db.insert(tenantMembers)
    .values({ id: "tm-q1", tenantId: TENANT_ID, userId: USER_ID })
    .run();
});

// ─── enqueueSource ──────────────────────────────────────────────────────

describe("enqueueSource", () => {
  it("ACTIVE 소스를 큐에 등록하면 1을 반환", async () => {
    const srcId = insertSource();
    const result = await service.enqueueSource(srcId, TENANT_ID);
    expect(result).toBe(1);

    const rows = db.select().from(radarCrawlQueue).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].sourceId).toBe(srcId);
    expect(rows[0].status).toBe(CrawlQueueStatus.PENDING);
    expect(rows[0].parserType).toBe("rss");
  });

  it("RSS 소스는 parserType=rss, SITE 소스는 parserType=html", async () => {
    const rssId = insertSource({ id: "src-rss", sourceType: "rss" });
    const siteId = insertSource({ id: "src-site", sourceType: "site" });

    await service.enqueueSource(rssId, TENANT_ID);
    await service.enqueueSource(siteId, TENANT_ID);

    const rows = db.select().from(radarCrawlQueue).all();
    const rssQueue = rows.find((r) => r.sourceId === "src-rss");
    const siteQueue = rows.find((r) => r.sourceId === "src-site");

    expect(rssQueue?.parserType).toBe("rss");
    expect(siteQueue?.parserType).toBe("html");
  });

  it("PAUSED 소스는 큐에 등록하지 않음", async () => {
    const srcId = insertSource({ status: "PAUSED" });
    const result = await service.enqueueSource(srcId, TENANT_ID);
    expect(result).toBe(0);
  });

  it("FAILED 소스는 큐에 등록하지 않음", async () => {
    const srcId = insertSource({ status: "FAILED" });
    const result = await service.enqueueSource(srcId, TENANT_ID);
    expect(result).toBe(0);
  });

  it("crawlInterval 미경과 시 스킵", async () => {
    const recentTime = new Date(Date.now() - 3600 * 1000); // 1시간 전
    const srcId = insertSource({ crawlInterval: 86400, lastCollectedAt: recentTime });

    const result = await service.enqueueSource(srcId, TENANT_ID);
    expect(result).toBe(0);
  });

  it("crawlInterval 경과 시 등록", async () => {
    const oldTime = new Date(Date.now() - 100_000 * 1000); // 약 27시간 전
    const srcId = insertSource({ crawlInterval: 86400, lastCollectedAt: oldTime });

    const result = await service.enqueueSource(srcId, TENANT_ID);
    expect(result).toBe(1);
  });

  it("이미 PENDING/PROCESSING 큐 아이템이 있으면 중복 등록하지 않음", async () => {
    const srcId = insertSource({ id: "src-dup" });
    insertQueueItem({ sourceId: "src-dup", status: CrawlQueueStatus.PENDING });

    const result = await service.enqueueSource(srcId, TENANT_ID);
    expect(result).toBe(0);
  });

  it("COMPLETED/FAILED 큐 아이템이 있어도 새 큐 아이템 등록 가능", async () => {
    const srcId = insertSource({ id: "src-retry" });
    insertQueueItem({ sourceId: "src-retry", status: CrawlQueueStatus.COMPLETED });

    const result = await service.enqueueSource(srcId, TENANT_ID);
    expect(result).toBe(1);
  });

  it("존재하지 않는 소스는 0 반환", async () => {
    const result = await service.enqueueSource("nonexistent", TENANT_ID);
    expect(result).toBe(0);
  });
});

// ─── dequeueBatch ───────────────────────────────────────────────────────

describe("dequeueBatch", () => {
  it("PENDING 아이템을 PROCESSING으로 변경 후 반환", async () => {
    const srcId = insertSource({ id: "src-dq" });
    insertQueueItem({ sourceId: "src-dq" });

    const batch = await service.dequeueBatch(TENANT_ID, 10);
    expect(batch).toHaveLength(1);
    expect(batch[0].status).toBe(CrawlQueueStatus.PROCESSING);
    expect(batch[0].startedAt).not.toBeNull();
  });

  it("limit만큼만 가져옴", async () => {
    const srcId = insertSource({ id: "src-lim" });
    for (let i = 0; i < 5; i++) {
      insertQueueItem({ sourceId: "src-lim" });
    }

    const batch = await service.dequeueBatch(TENANT_ID, 3);
    expect(batch).toHaveLength(3);
  });

  it("priority DESC, scheduledAt ASC 순서", async () => {
    const srcId = insertSource({ id: "src-pri" });
    const pastTime = new Date(Date.now() - 60000);
    insertQueueItem({ id: "q-low", sourceId: "src-pri", priority: 0, scheduledAt: pastTime });
    insertQueueItem({ id: "q-high", sourceId: "src-pri", priority: 10, scheduledAt: new Date() });

    const batch = await service.dequeueBatch(TENANT_ID, 10);
    expect(batch[0].id).toBe("q-high"); // priority 높은 게 먼저
  });

  it("[F3] stale PROCESSING 아이템 (10분 초과) → PENDING 복구", async () => {
    const srcId = insertSource({ id: "src-stale" });
    const staleTime = new Date(Date.now() - 15 * 60 * 1000); // 15분 전

    insertQueueItem({
      id: "q-stale",
      sourceId: "src-stale",
      status: CrawlQueueStatus.PROCESSING,
      startedAt: staleTime,
    });

    // dequeueBatch 호출 시 stale 아이템이 복구되어 반환됨
    const batch = await service.dequeueBatch(TENANT_ID, 10);
    expect(batch).toHaveLength(1);
    expect(batch[0].id).toBe("q-stale");
    expect(batch[0].status).toBe(CrawlQueueStatus.PROCESSING);
  });

  it("next_retry_at가 미래인 PENDING 아이템은 스킵", async () => {
    const srcId = insertSource({ id: "src-retry-future" });
    const futureTime = new Date(Date.now() + 3600 * 1000); // 1시간 후

    insertQueueItem({
      sourceId: "src-retry-future",
      status: CrawlQueueStatus.PENDING,
      nextRetryAt: futureTime,
    });

    const batch = await service.dequeueBatch(TENANT_ID, 10);
    expect(batch).toHaveLength(0);
  });

  it("빈 큐 시 빈 배열 반환", async () => {
    const batch = await service.dequeueBatch(TENANT_ID, 10);
    expect(batch).toHaveLength(0);
  });
});

// ─── completeQueueItem ──────────────────────────────────────────────────

describe("completeQueueItem", () => {
  it("큐 아이템 COMPLETED + source.consecutiveFailures 리셋", async () => {
    const srcId = insertSource({ id: "src-comp", consecutiveFailures: 2 });
    const qId = insertQueueItem({ id: "q-comp", sourceId: "src-comp", status: CrawlQueueStatus.PROCESSING });

    await service.completeQueueItem("q-comp", 3);

    const qRow = db.select().from(radarCrawlQueue).where(eq(radarCrawlQueue.id, "q-comp")).get();
    expect(qRow?.status).toBe(CrawlQueueStatus.COMPLETED);
    expect(qRow?.itemsCreated).toBe(3);
    expect(qRow?.completedAt).not.toBeNull();

    const srcRow = db.select().from(radarSources).where(eq(radarSources.id, "src-comp")).get();
    expect(srcRow?.consecutiveFailures).toBe(0);
    expect(srcRow?.lastCollectedAt).not.toBeNull();
  });
});

// ─── failQueueItem ──────────────────────────────────────────────────────

describe("failQueueItem", () => {
  it("재시도 가능 시 FAILED + 지수 백오프 설정", async () => {
    const srcId = insertSource({ id: "src-fail" });
    insertQueueItem({ id: "q-fail", sourceId: "src-fail", retryCount: 0, maxRetries: 3 });

    await service.failQueueItem("q-fail", "TIMEOUT", "Connection timeout");

    const qRow = db.select().from(radarCrawlQueue).where(eq(radarCrawlQueue.id, "q-fail")).get();
    expect(qRow?.status).toBe(CrawlQueueStatus.FAILED);
    expect(qRow?.retryCount).toBe(1);
    expect(qRow?.failureCode).toBe("TIMEOUT");
    expect(qRow?.nextRetryAt).not.toBeNull();
  });

  it("최대 재시도 도달 시 DEAD + source.consecutiveFailures 증가", async () => {
    const srcId = insertSource({ id: "src-dead", consecutiveFailures: 0 });
    insertQueueItem({ id: "q-dead", sourceId: "src-dead", retryCount: 2, maxRetries: 3 });

    await service.failQueueItem("q-dead", "NETWORK_ERROR", "Server error");

    const qRow = db.select().from(radarCrawlQueue).where(eq(radarCrawlQueue.id, "q-dead")).get();
    expect(qRow?.status).toBe(CrawlQueueStatus.DEAD);
    expect(qRow?.retryCount).toBe(3);

    const srcRow = db.select().from(radarSources).where(eq(radarSources.id, "src-dead")).get();
    expect(srcRow?.consecutiveFailures).toBe(1);
  });

  it("source consecutiveFailures >= 3 → REVIEW 자동 전환", async () => {
    const srcId = insertSource({ id: "src-review", consecutiveFailures: 2 });
    insertQueueItem({ id: "q-review", sourceId: "src-review", retryCount: 2, maxRetries: 3 });

    await service.failQueueItem("q-review", "TIMEOUT", "timeout");

    const srcRow = db.select().from(radarSources).where(eq(radarSources.id, "src-review")).get();
    expect(srcRow?.consecutiveFailures).toBe(3);
    expect(srcRow?.status).toBe("REVIEW");
    expect(srcRow?.enabled).toBe(0);
  });

  it("source consecutiveFailures >= 5 → FAILED 자동 전환", async () => {
    const srcId = insertSource({ id: "src-auto-fail", consecutiveFailures: 4 });
    insertQueueItem({ id: "q-auto-fail", sourceId: "src-auto-fail", retryCount: 2, maxRetries: 3 });

    await service.failQueueItem("q-auto-fail", "NETWORK_ERROR", "error");

    const srcRow = db.select().from(radarSources).where(eq(radarSources.id, "src-auto-fail")).get();
    expect(srcRow?.consecutiveFailures).toBe(5);
    expect(srcRow?.status).toBe("FAILED");
    expect(srcRow?.enabled).toBe(0);
  });

  it("PAUSED 상태 소스는 자동 전환하지 않음", async () => {
    const srcId = insertSource({ id: "src-paused-fail", status: "PAUSED", consecutiveFailures: 4 });
    insertQueueItem({ id: "q-paused", sourceId: "src-paused-fail", retryCount: 2, maxRetries: 3 });

    await service.failQueueItem("q-paused", "TIMEOUT", "timeout");

    const srcRow = db.select().from(radarSources).where(eq(radarSources.id, "src-paused-fail")).get();
    // PAUSED 상태 유지 (ACTIVE에서만 자동 전환)
    expect(srcRow?.status).toBe("PAUSED");
  });

  it("존재하지 않는 큐 아이템은 무시", async () => {
    // 에러 없이 조용히 무시
    await expect(
      service.failQueueItem("nonexistent", "TIMEOUT", "err"),
    ).resolves.toBeUndefined();
  });
});

// ─── getQueueStatus ─────────────────────────────────────────────────────

describe("getQueueStatus", () => {
  it("빈 큐 시 모든 카운트 0", async () => {
    const result = await service.getQueueStatus(TENANT_ID);
    expect(result).toEqual({
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      dead: 0,
    });
  });

  it("상태별 카운트 정확히 반환", async () => {
    const srcId = insertSource({ id: "src-status" });
    insertQueueItem({ sourceId: "src-status", status: CrawlQueueStatus.PENDING });
    insertQueueItem({ sourceId: "src-status", status: CrawlQueueStatus.PENDING });
    insertQueueItem({ sourceId: "src-status", status: CrawlQueueStatus.PROCESSING });
    insertQueueItem({ sourceId: "src-status", status: CrawlQueueStatus.COMPLETED });
    insertQueueItem({ sourceId: "src-status", status: CrawlQueueStatus.FAILED });
    insertQueueItem({ sourceId: "src-status", status: CrawlQueueStatus.DEAD });

    const result = await service.getQueueStatus(TENANT_ID);
    expect(result.pending).toBe(2);
    expect(result.processing).toBe(1);
    expect(result.completed).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.dead).toBe(1);
  });
});

// ─── cleanupQueue [R5] ─────────────────────────────────────────────────

describe("cleanupQueue [R5]", () => {
  it("COMPLETED 7일 이상 된 아이템 삭제", async () => {
    const srcId = insertSource({ id: "src-cleanup" });
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    insertQueueItem({
      id: "q-old-completed",
      sourceId: "src-cleanup",
      status: CrawlQueueStatus.COMPLETED,
      completedAt: eightDaysAgo,
    });
    insertQueueItem({
      id: "q-recent-completed",
      sourceId: "src-cleanup",
      status: CrawlQueueStatus.COMPLETED,
      completedAt: oneDayAgo,
    });

    const deleted = await service.cleanupQueue(TENANT_ID);
    expect(deleted).toBe(1);

    const remaining = db.select().from(radarCrawlQueue).all();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe("q-recent-completed");
  });

  it("DEAD 30일 이상 된 아이템 삭제", async () => {
    const srcId = insertSource({ id: "src-dead-clean" });
    const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);

    insertQueueItem({
      id: "q-old-dead",
      sourceId: "src-dead-clean",
      status: CrawlQueueStatus.DEAD,
      completedAt: fortyDaysAgo,
    });

    const deleted = await service.cleanupQueue(TENANT_ID);
    expect(deleted).toBe(1);
  });

  it("PENDING/PROCESSING/FAILED는 정리하지 않음", async () => {
    const srcId = insertSource({ id: "src-no-clean" });
    insertQueueItem({ sourceId: "src-no-clean", status: CrawlQueueStatus.PENDING });
    insertQueueItem({ sourceId: "src-no-clean", status: CrawlQueueStatus.FAILED });

    const deleted = await service.cleanupQueue(TENANT_ID);
    expect(deleted).toBe(0);
    expect(db.select().from(radarCrawlQueue).all()).toHaveLength(2);
  });
});

// ─── getRecentFailedQueue ───────────────────────────────────────────────

describe("getRecentFailedQueue", () => {
  it("FAILED/DEAD 상태 큐 아이템을 소스 이름과 함께 반환", async () => {
    const srcId = insertSource({ id: "src-rf", name: "GeekNews" });
    insertQueueItem({
      sourceId: "src-rf",
      status: CrawlQueueStatus.FAILED,
      failureCode: "TIMEOUT",
      retryCount: 1,
      maxRetries: 3,
    });

    const result = await service.getRecentFailedQueue(TENANT_ID, 5);
    expect(result).toHaveLength(1);
    expect(result[0].sourceName).toBe("GeekNews");
    expect(result[0].failureCode).toBe("TIMEOUT");
  });

  it("PENDING/COMPLETED는 포함하지 않음", async () => {
    const srcId = insertSource({ id: "src-rf2" });
    insertQueueItem({ sourceId: "src-rf2", status: CrawlQueueStatus.PENDING });
    insertQueueItem({ sourceId: "src-rf2", status: CrawlQueueStatus.COMPLETED });

    const result = await service.getRecentFailedQueue(TENANT_ID, 5);
    expect(result).toHaveLength(0);
  });
});

// ─── deleteSource cascade [F1] ──────────────────────────────────────────

describe("deleteSource — crawl_queue cascade [F1]", () => {
  it("소스 삭제 시 큐 아이템도 함께 삭제", async () => {
    const srcId = insertSource({ id: "src-del" });
    insertQueueItem({ sourceId: "src-del" });
    insertQueueItem({ sourceId: "src-del" });

    await service.deleteSource("src-del");

    const queueRows = db.select().from(radarCrawlQueue).all();
    expect(queueRows).toHaveLength(0);

    const srcRows = db.select().from(radarSources).where(eq(radarSources.id, "src-del")).all();
    expect(srcRows).toHaveLength(0);
  });
});
