/**
 * Cron Bearer 인증 라우트 통합 테스트 (4개 엔드포인트)
 *
 * Authorization: Bearer CRON_SECRET 방식 인증 Cron 엔드포인트의
 * 인증, CRON_SECRET 미설정, Feature Flag, 정상 응답 검증.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb, type TestDB } from "../helpers/db";
import { tenants, users } from "~/db";

// ─── DB Mock ─────────────────────────────────────────────────────────────
let testDb: TestDB;
vi.mock("~/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/db")>();
  return { ...actual, getDb: () => testDb };
});

// ─── 클래스 기반 외부 의존성 Mock ───────────────────────────────────────
vi.mock("~/lib/integration/signal-router", () => ({
  SignalRouter: class {
    routePendingSignals = vi.fn().mockResolvedValue({ routed: 0, errors: [] });
  },
}));

vi.mock("~/features/chat/agent/memory-lifecycle", () => ({
  MemoryLifecycle: class {
    compact = vi.fn().mockResolvedValue({ archived: 0, deleted: 0 });
  },
}));

vi.mock("~/lib/cost/token-budget", () => ({
  TokenBudgetManager: class {
    enforceMemoryBudget = vi.fn().mockResolvedValue(0);
  },
}));

vi.mock("~/lib/graph/projection", () => ({
  ProjectionBuilder: class {
    syncProjection = vi.fn().mockResolvedValue(true);
  },
}));

vi.mock("~/lib/services/scoring.service", () => ({
  ScoringService: class {
    recalculateAll = vi.fn().mockResolvedValue({ processed: 0, updated: 0, errors: [] });
  },
}));

// ─── Loader/Action imports (mock 설정 후 import) ────────────────────────
import { loader as signalRouteLoader } from "~/routes/api.cron.signal-route";
import { action as maintenanceAction } from "~/routes/api.cron.maintenance";
import { action as matrixScoringAction } from "~/routes/api.cron.matrix-scoring";

// ─── 헬퍼 ──────────────────────────────────────────────────────────────

/** Bearer 인증 GET 요청 생성 */
function makeBearerRequest(path: string, token?: string): Request {
  const headers: HeadersInit = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return new Request(`http://localhost/api/cron/${path}`, { headers });
}

/** Bearer 인증 POST 요청 생성 (action 엔드포인트용) */
function makePostBearerRequest(path: string, token?: string): Request {
  const headers: HeadersInit = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return new Request(`http://localhost/api/cron/${path}`, {
    method: "POST",
    headers,
  });
}

/** Cron context mock */
function ctx(envOverrides: Record<string, unknown> = {}) {
  return {
    cloudflare: {
      env: { CRON_SECRET: "test-secret", DB: {}, ...envOverrides },
    },
  } as never;
}

/** CRON_SECRET가 없는 context (500 테스트용) */
function ctxNoSecret(envOverrides: Record<string, unknown> = {}) {
  return {
    cloudflare: {
      env: { DB: {}, ...envOverrides },
    },
  } as never;
}

/** 테스트용 active 테넌트 시드 */
function seedTenant() {
  testDb
    .insert(users)
    .values({ id: "u-sys", email: "sys@t.local", name: "Sys", role: "admin" })
    .run();
  testDb
    .insert(tenants)
    .values({
      id: "t-1",
      name: "T",
      slug: "test-t",
      status: "active",
      ownerUserId: "u-sys",
    })
    .run();
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. api.cron.signal-route — Bearer + Feature Flag (pipelineBridge)
// ═══════════════════════════════════════════════════════════════════════════
describe("api.cron.signal-route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testDb = createTestDb();
  });

  it("인증 실패 (잘못된 토큰) → 401", async () => {
    const r = await signalRouteLoader({
      request: makeBearerRequest("signal-route", "wrong-token"),
      context: ctx(),
      params: {},
    });
    expect(r.status).toBe(401);
  });

  it("CRON_SECRET 미설정 → 500", async () => {
    const r = await signalRouteLoader({
      request: makeBearerRequest("signal-route", "any"),
      context: ctxNoSecret(),
      params: {},
    });
    expect(r.status).toBe(500);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ error: "CRON_SECRET not configured" });
  });

  // Feature Flag 테스트 제거 — FF 시스템 삭제됨 (S3)

  it("정상 호출 → 200", async () => {
    const r = await signalRouteLoader({
      request: makeBearerRequest("signal-route", "test-secret"),
      context: ctx({}),
      params: {},
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ routed: 0 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. api.cron.maintenance — Bearer + POST + task 파라미터
// ═══════════════════════════════════════════════════════════════════════════
describe("api.cron.maintenance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testDb = createTestDb();
  });

  it("GET → 405 (POST only)", async () => {
    const r = await maintenanceAction({
      request: makeBearerRequest("maintenance", "test-secret"),
      context: ctx(),
      params: {},
    });
    expect(r.status).toBe(405);
  });

  it("인증 실패 → 401", async () => {
    const r = await maintenanceAction({
      request: makePostBearerRequest("maintenance", "wrong"),
      context: ctx(),
      params: {},
    });
    expect(r.status).toBe(401);
  });

  it("CRON_SECRET 미설정 → 500", async () => {
    const r = await maintenanceAction({
      request: makePostBearerRequest("maintenance"),
      context: ctxNoSecret(),
      params: {},
    });
    expect(r.status).toBe(500);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ error: "CRON_SECRET not configured" });
  });

  it("알 수 없는 task → 400", async () => {
    const r = await maintenanceAction({
      request: makePostBearerRequest("maintenance?task=unknown", "test-secret"),
      context: ctx(),
      params: {},
    });
    expect(r.status).toBe(400);
    const body = (await r.json()) as Record<string, unknown>;
    expect(typeof body.error).toBe("string");
  });

  it("task=memory-compact → 200, 응답 구조 검증", async () => {
    const r = await maintenanceAction({
      request: makePostBearerRequest("maintenance?task=memory-compact", "test-secret"),
      context: ctx(),
      params: {},
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body.task).toBe("memory-compact");
    const compact = body["memory-compact"] as Record<string, unknown>;
    expect(compact).toHaveProperty("usersProcessed");
    expect(compact).toHaveProperty("totalArchived");
    expect(compact).toHaveProperty("totalDeleted");
    expect(compact.errors).toBeInstanceOf(Array);
  });

  it("task=projection-sync → 200 (그래프 없음)", async () => {
    const r = await maintenanceAction({
      request: makePostBearerRequest("maintenance?task=projection-sync", "test-secret"),
      context: ctx(),
      params: {},
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body.task).toBe("projection-sync");
    const sync = body["projection-sync"] as Record<string, unknown>;
    expect(sync).toMatchObject({ synced: 0, skipped: 0, errors: 0 });
  });

  it("task=log-archive → 200, archived: 0 (데이터 없음)", async () => {
    seedTenant();
    const r = await maintenanceAction({
      request: makePostBearerRequest("maintenance?task=log-archive", "test-secret"),
      context: ctx(),
      params: {},
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as Record<string, unknown>;
    const archive = body["log-archive"] as Record<string, unknown>;
    expect(archive.archived).toBe(0);
    expect(archive.batchId).toMatch(/^archive-/);
  });

  it("task=pattern-extract → 200, logsAnalyzed: 0 (데이터 없음)", async () => {
    seedTenant();
    const r = await maintenanceAction({
      request: makePostBearerRequest("maintenance?task=pattern-extract", "test-secret"),
      context: ctx(),
      params: {},
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as Record<string, unknown>;
    const extract = body["pattern-extract"] as Record<string, unknown>;
    expect(extract.logsAnalyzed).toBe(0);
  });

  it("task=all → 200, 4개 결과 모두 포함", async () => {
    const r = await maintenanceAction({
      request: makePostBearerRequest("maintenance?task=all", "test-secret"),
      context: ctx(),
      params: {},
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body.task).toBe("all");
    expect(body).toHaveProperty("log-archive");
    expect(body).toHaveProperty("memory-compact");
    expect(body).toHaveProperty("projection-sync");
    expect(body).toHaveProperty("pattern-extract");
  });

  it("task 누락 시 all로 동작", async () => {
    const r = await maintenanceAction({
      request: makePostBearerRequest("maintenance", "test-secret"),
      context: ctx(),
      params: {},
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body.task).toBe("all");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. api.cron.matrix-scoring — Bearer + POST only
// ═══════════════════════════════════════════════════════════════════════════
describe("api.cron.matrix-scoring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testDb = createTestDb();
  });

  it("POST 이외 메서드 → 405", async () => {
    const r = await matrixScoringAction({
      request: makeBearerRequest("matrix-scoring", "test-secret"),
      context: ctx(),
      params: {},
    });
    expect(r.status).toBe(405);
  });

  it("인증 실패 → 401", async () => {
    const r = await matrixScoringAction({
      request: makePostBearerRequest("matrix-scoring", "wrong"),
      context: ctx(),
      params: {},
    });
    expect(r.status).toBe(401);
  });

  it("정상 호출 → 200, 응답 구조 검증", async () => {
    const r = await matrixScoringAction({
      request: makePostBearerRequest("matrix-scoring", "test-secret"),
      context: ctx(),
      params: {},
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body).toHaveProperty("tenants");
    expect(body).toHaveProperty("totalProcessed");
    expect(body).toHaveProperty("totalUpdated");
    expect(body.period).toMatch(/^\d{4}-\d{2}$/);
  });
});
