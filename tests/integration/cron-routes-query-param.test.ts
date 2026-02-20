/**
 * Cron Query Param 인증 라우트 통합 테스트 (10개 엔드포인트)
 *
 * ?secret=CRON_SECRET 방식 인증 Cron 엔드포인트의 인증, 에러 핸들링, 정상 응답 검증.
 * 기존 cron-vectorize-routes.test.ts 패턴을 따름.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb, type TestDB } from "../helpers/db";
import { tenants, users } from "~/db/schema";

// ─── DB Mock ─────────────────────────────────────────────────────────────
let testDb: TestDB;
vi.mock("~/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/db")>();
  return { ...actual, getDb: () => testDb };
});

// ─── 외부 의존성 Mock ──────────────────────────────────────────────────
vi.mock("~/lib/ontology/extractor", () => ({
  extractOntologyBatch: vi.fn().mockResolvedValue({ extracted: 0, skipped: 0, errors: [] }),
}));

vi.mock("~/lib/ontology/analyzer", () => ({
  detectPatterns: vi.fn().mockResolvedValue([]),
  detectContradictions: vi.fn().mockResolvedValue([]),
  detectClusters: vi.fn().mockResolvedValue([]),
  analyzeCentrality: vi.fn().mockResolvedValue([]),
}));

vi.mock("~/lib/embeddings/sync", () => ({
  syncEmbeddings: vi.fn().mockResolvedValue({ synced: 0, skipped: 0, errors: [] }),
}));

vi.mock("~/lib/notifications/email", () => ({
  createEmailClient: vi.fn().mockReturnValue({
    send: vi.fn().mockResolvedValue({ success: true }),
  }),
}));

vi.mock("~/lib/notifications/alert-engine", () => ({
  scanAndFireAlerts: vi.fn().mockResolvedValue([]),
  processExpiredGateApprovals: vi.fn().mockResolvedValue({
    expiredCount: 0,
    holdCount: 0,
    reminderCount: 0,
    details: { expired: [], held: [], reminders: [] },
  }),
  DEFAULT_ALERT_RULES: [],
}));

vi.mock("~/lib/notifications/webhook", () => ({
  fireWebhooks: vi.fn().mockResolvedValue(0),
}));

vi.mock("~/lib/agent/executor", () => ({
  executeAgentTurn: vi.fn().mockResolvedValue({
    toolCalls: [],
    tokensUsed: { input: 100, output: 50 },
    response: "done",
  }),
}));

// ─── Loader/Action imports (mock 설정 후 import) ────────────────────────
import { loader as labLoader } from "~/routes/api.cron.lab";
import { loader as patternExtractLoader } from "~/routes/api.cron.pattern-extract";
import { loader as embeddingsLoader } from "~/routes/api.cron.embeddings";
import { loader as logArchiveLoader } from "~/routes/api.cron.log-archive";
import { loader as dailyLoader } from "~/routes/api.cron.daily";
import { loader as alertsLoader } from "~/routes/api.cron.alerts";
import { action as agentReviewAction } from "~/routes/api.cron.agent-review";
import { loader as weeklySummaryLoader } from "~/routes/api.cron.weekly-summary";

// ─── 헬퍼 ──────────────────────────────────────────────────────────────

/** Query Param 인증 GET 요청 생성 */
function makeQPRequest(path: string, secret?: string): Request {
  const separator = path.includes("?") ? "&" : "?";
  const url = secret
    ? `http://localhost/api/cron/${path}${separator}secret=${secret}`
    : `http://localhost/api/cron/${path}`;
  return new Request(url);
}

/** Query Param 인증 POST 요청 생성 (action 엔드포인트용) */
function makePostQPRequest(path: string, secret?: string): Request {
  const separator = path.includes("?") ? "&" : "?";
  const url = secret
    ? `http://localhost/api/cron/${path}${separator}secret=${secret}`
    : `http://localhost/api/cron/${path}`;
  return new Request(url, { method: "POST" });
}

/** Cron context mock */
function ctx(envOverrides: Record<string, unknown> = {}) {
  return {
    cloudflare: {
      env: { CRON_SECRET: "test-secret", DB: {}, ...envOverrides },
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
// 1. api.cron.lab?mode=extract — ANTHROPIC_API_KEY 필요
// ═══════════════════════════════════════════════════════════════════════════
describe("api.cron.lab (mode=extract)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testDb = createTestDb();
  });

  it("인증 실패 → 401", async () => {
    const r = await labLoader({
      request: makeQPRequest("lab?mode=extract", "wrong"),
      context: ctx(),
      params: {},
    });
    expect(r.status).toBe(401);
  });

  it("mode 누락 → 400", async () => {
    const r = await labLoader({
      request: makeQPRequest("lab", "test-secret"),
      context: ctx(),
      params: {},
    });
    expect(r.status).toBe(400);
  });

  it("ANTHROPIC_API_KEY 누락 → 500", async () => {
    const r = await labLoader({
      request: makeQPRequest("lab?mode=extract", "test-secret"),
      context: ctx(),
      params: {},
    });
    expect(r.status).toBe(500);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ error: "ANTHROPIC_API_KEY not configured" });
  });

  it("정상 호출 → 200, success: true", async () => {
    seedTenant();
    const r = await labLoader({
      request: makeQPRequest("lab?mode=extract", "test-secret"),
      context: ctx({ ANTHROPIC_API_KEY: "sk-test" }),
      params: {},
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body.success).toBe(true);
    expect(body.results).toBeInstanceOf(Array);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. api.cron.lab?mode=analyze — DB만 필요
// ═══════════════════════════════════════════════════════════════════════════
describe("api.cron.lab (mode=analyze)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testDb = createTestDb();
  });

  it("인증 실패 → 401", async () => {
    const r = await labLoader({
      request: makeQPRequest("lab?mode=analyze", "wrong"),
      context: ctx(),
      params: {},
    });
    expect(r.status).toBe(401);
  });

  it("정상 호출 → 200, 배열 반환", async () => {
    const r = await labLoader({
      request: makeQPRequest("lab?mode=analyze", "test-secret"),
      context: ctx(),
      params: {},
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body).toBeInstanceOf(Array);
  });

  it("정상 호출 → 테넌트별 분석 구조 포함", async () => {
    const r = await labLoader({
      request: makeQPRequest("lab?mode=analyze", "test-secret"),
      context: ctx(),
      params: {},
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as Record<string, unknown>;
    // default-tenant가 마이그레이션에서 자동 생성됨
    expect(body[0]).toMatchObject({ patterns: [], contradictions: [] });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. api.cron.pattern-extract — DB만 필요 (weak auth)
// ═══════════════════════════════════════════════════════════════════════════
describe("api.cron.pattern-extract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testDb = createTestDb();
  });

  it("인증 실패 → 401", async () => {
    const r = await patternExtractLoader({
      request: makeQPRequest("pattern-extract", "wrong"),
      context: ctx(),
      params: {},
    });
    expect(r.status).toBe(401);
  });

  it("active 테넌트 없으면 logsAnalyzed: 0", async () => {
    const r = await patternExtractLoader({
      request: makeQPRequest("pattern-extract", "test-secret"),
      context: ctx(),
      params: {},
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ job: "pattern-extract", logsAnalyzed: 0 });
  });

  it("정상 호출 → executedAt 포함", async () => {
    seedTenant();
    const r = await patternExtractLoader({
      request: makeQPRequest("pattern-extract", "test-secret"),
      context: ctx(),
      params: {},
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body.executedAt).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. api.cron.embeddings — OPENAI_API_KEY 필요
// ═══════════════════════════════════════════════════════════════════════════
describe("api.cron.embeddings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testDb = createTestDb();
  });

  it("인증 실패 → 401", async () => {
    const r = await embeddingsLoader({
      request: makeQPRequest("embeddings", "wrong"),
      context: ctx(),
      params: {},
    });
    expect(r.status).toBe(401);
  });

  it("OPENAI_API_KEY 누락 → 500", async () => {
    const r = await embeddingsLoader({
      request: makeQPRequest("embeddings", "test-secret"),
      context: ctx(),
      params: {},
    });
    expect(r.status).toBe(500);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ error: "OPENAI_API_KEY not configured" });
  });

  it("정상 호출 → 200", async () => {
    seedTenant();
    const r = await embeddingsLoader({
      request: makeQPRequest("embeddings", "test-secret"),
      context: ctx({ OPENAI_API_KEY: "sk-test", VECTORIZE_DISCOVERIES: {} }),
      params: {},
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body).toBeInstanceOf(Array);
    expect(body.length).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. api.cron.log-archive — DB만 필요 (weak auth)
// ═══════════════════════════════════════════════════════════════════════════
describe("api.cron.log-archive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testDb = createTestDb();
  });

  it("인증 실패 → 401", async () => {
    const r = await logArchiveLoader({
      request: makeQPRequest("log-archive", "wrong"),
      context: ctx(),
      params: {},
    });
    expect(r.status).toBe(401);
  });

  it("active 테넌트 없으면 archived: 0", async () => {
    const r = await logArchiveLoader({
      request: makeQPRequest("log-archive", "test-secret"),
      context: ctx(),
      params: {},
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ job: "log-archive", archived: 0 });
  });

  it("정상 호출 → batchId 포함", async () => {
    seedTenant();
    const r = await logArchiveLoader({
      request: makeQPRequest("log-archive", "test-secret"),
      context: ctx(),
      params: {},
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body.batchId).toMatch(/^archive-/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. api.cron.daily — RESEND_API_KEY 필요
// ═══════════════════════════════════════════════════════════════════════════
describe("api.cron.daily", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testDb = createTestDb();
  });

  it("인증 실패 → 401", async () => {
    const r = await dailyLoader({
      request: makeQPRequest("daily", "wrong"),
      context: ctx(),
      params: {},
    });
    expect(r.status).toBe(401);
  });

  it("RESEND_API_KEY 누락 → 에러 메시지 포함", async () => {
    const r = await dailyLoader({
      request: makeQPRequest("daily", "test-secret"),
      context: ctx(),
      params: {},
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body.errors).toContain("RESEND_API_KEY not configured");
    expect(body.sent).toBe(0);
  });

  it("정상 호출 → 200", async () => {
    const r = await dailyLoader({
      request: makeQPRequest("daily", "test-secret"),
      context: ctx({ RESEND_API_KEY: "re_test" }),
      params: {},
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body.sent).toBe(0);
    expect(body.autoClosed).toBe(0);
    expect(body.inboxExpired).toBe(0);
    expect(body.gateExpired).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. api.cron.alerts — DB만 필요
// ═══════════════════════════════════════════════════════════════════════════
describe("api.cron.alerts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testDb = createTestDb();
  });

  it("인증 실패 → 401", async () => {
    const r = await alertsLoader({
      request: makeQPRequest("alerts", "wrong"),
      context: ctx(),
      params: {},
    });
    expect(r.status).toBe(401);
  });

  it("active 테넌트 없으면 fired: 0", async () => {
    const r = await alertsLoader({
      request: makeQPRequest("alerts", "test-secret"),
      context: ctx(),
      params: {},
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ fired: 0, webhooksSent: 0 });
  });

  it("정상 호출 → 200, errors 배열 포함", async () => {
    seedTenant();
    const r = await alertsLoader({
      request: makeQPRequest("alerts", "test-secret"),
      context: ctx(),
      params: {},
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body.errors).toBeInstanceOf(Array);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. api.cron.agent-review — ANTHROPIC_API_KEY 필요 (action/POST)
// ═══════════════════════════════════════════════════════════════════════════
describe("api.cron.agent-review", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testDb = createTestDb();
  });

  it("인증 실패 → 401", async () => {
    const r = await agentReviewAction({
      request: makePostQPRequest("agent-review", "wrong"),
      context: ctx(),
      params: {},
    });
    expect(r.status).toBe(401);
  });

  it("ANTHROPIC_API_KEY 누락 → 500", async () => {
    const r = await agentReviewAction({
      request: makePostQPRequest("agent-review", "test-secret"),
      context: ctx(),
      params: {},
    });
    expect(r.status).toBe(500);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ error: "ANTHROPIC_API_KEY not configured" });
  });

  it("정상 (리뷰 대상 없음) → 200", async () => {
    const r = await agentReviewAction({
      request: makePostQPRequest("agent-review", "test-secret"),
      context: ctx({ ANTHROPIC_API_KEY: "sk-test" }),
      params: {},
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body.message).toContain("No discoveries need review");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 10. api.cron.weekly-summary — RESEND_API_KEY 필요
// ═══════════════════════════════════════════════════════════════════════════
describe("api.cron.weekly-summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testDb = createTestDb();
  });

  it("인증 실패 → 401", async () => {
    const r = await weeklySummaryLoader({
      request: makeQPRequest("weekly-summary", "wrong"),
      context: ctx(),
      params: {},
    });
    expect(r.status).toBe(401);
  });

  it("RESEND_API_KEY 누락 → 에러 메시지 포함", async () => {
    const r = await weeklySummaryLoader({
      request: makeQPRequest("weekly-summary", "test-secret"),
      context: ctx(),
      params: {},
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body.errors).toContain("RESEND_API_KEY not configured");
  });

  it("정상 호출 → 200", async () => {
    const r = await weeklySummaryLoader({
      request: makeQPRequest("weekly-summary", "test-secret"),
      context: ctx({ RESEND_API_KEY: "re_test" }),
      params: {},
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body.sent).toBe(0);
    expect(body.errors).toEqual([]);
  });
});
