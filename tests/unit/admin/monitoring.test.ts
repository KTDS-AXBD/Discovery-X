import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── 모듈 모킹 ────────────────────────────────────────────────────────

// requireAdmin: 인증 성공 시 유저 객체 반환
const mockRequireAdmin = vi.fn();
const mockGetSessionSecret = vi.fn().mockReturnValue("test-secret");

vi.mock("~/lib/auth/session.server", () => ({
  requireAdmin: (...args: unknown[]) => mockRequireAdmin(...args),
  getSessionSecret: (...args: unknown[]) => mockGetSessionSecret(...args),
}));

// getDb: Drizzle DB mock
const mockGetDb = vi.fn();
vi.mock("~/db", () => ({
  getDb: (...args: unknown[]) => mockGetDb(...args),
}));

// Feature flags
vi.mock("~/lib/feature-flags", () => ({
  getFeatureFlags: (env: Record<string, string | undefined>) => ({
    graphLayer: env.FF_GRAPH_LAYER === "true",
    agentDO: env.FF_AGENT_DO === "true",
    topicCollab: env.FF_TOPIC_COLLAB === "true",
    aclScope: env.FF_ACL_SCOPE === "true",
    memoryLifecycle: env.FF_MEMORY_LIFECYCLE === "true",
    vectorizeSearch: env.FF_VECTORIZE_SEARCH === "true",
    pipelineBridge: env.FF_PIPELINE_BRIDGE === "true",
    collabWorker: env.FF_COLLAB_WORKER === "true",
    profileLearner: env.FF_PROFILE_LEARNER === "true",
  }),
}));

import { loader } from "~/routes/admin.monitoring";

// ─── 헬퍼 ──────────────────────────────────────────────────────────────

const ADMIN_USER = {
  id: "admin-1",
  email: "admin@test.com",
  role: "admin",
  name: "Admin",
};

function createMockContext(overrides?: {
  ffEnv?: Record<string, string>;
  cronRows?: Array<{
    id: number;
    cron_expression: string;
    results_json: string;
    created_at: number;
  }>;
}) {
  const cronRows = overrides?.cronRows ?? [];
  return {
    cloudflare: {
      env: {
        DB: { prepare: vi.fn().mockReturnValue({
          all: vi.fn().mockResolvedValue({ results: cronRows }),
        })},
        SESSION_SECRET: "test-secret",
        FF_GRAPH_LAYER: "true",
        FF_AGENT_DO: "false",
        ...(overrides?.ffEnv ?? {}),
      },
    },
  };
}

function createRequest(url = "http://localhost/admin/monitoring") {
  return new Request(url);
}

// ─── 테스트 ────────────────────────────────────────────────────────────

describe("admin.monitoring loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(ADMIN_USER);
    mockGetDb.mockReturnValue({});
  });

  it("관리자 인증을 요구한다", async () => {
    const ctx = createMockContext();
    const request = createRequest();

    await loader({ request, context: ctx, params: {} } as never);

    expect(mockRequireAdmin).toHaveBeenCalledWith(
      request,
      expect.anything(),
      "test-secret",
    );
  });

  it("비관리자는 403 에러가 발생한다", async () => {
    mockRequireAdmin.mockRejectedValue(
      new Response(JSON.stringify({ error: "관리자 권한이 필요합니다" }), {
        status: 403,
      }),
    );

    const ctx = createMockContext();
    await expect(
      loader({ request: createRequest(), context: ctx, params: {} } as never),
    ).rejects.toBeInstanceOf(Response);
  });

  // Feature Flag 테스트 제거 — FF 시스템 삭제됨 (S3)

  it("cron_logs 데이터를 조회한다", async () => {
    const cronRows = [
      {
        id: 1,
        cron_expression: "*/5 * * * *",
        results_json: JSON.stringify([
          { name: "test-cron", status: "ok", duration: 100 },
        ]),
        created_at: 1708300800,
      },
    ];
    const ctx = createMockContext({ cronRows });

    const response = await loader({
      request: createRequest(),
      context: ctx,
      params: {},
    } as never);

    const data = await response.json();
    expect(data.cronLogs).toHaveLength(1);
    expect(data.cronLogs[0].cronExpression).toBe("*/5 * * * *");
    expect(data.cronLogs[0].results[0].name).toBe("test-cron");
  });

  it("시스템 통계를 반환한다", async () => {
    const ctx = createMockContext();

    const response = await loader({
      request: createRequest(),
      context: ctx,
      params: {},
    } as never);

    const data = await response.json();
    expect(data.stats).toEqual({
      dbTables: 87,
      apiRoutes: 167,
      agentTools: 54,
      tests: 925,
    });
  });

  it("cron_logs 테이블이 없어도 에러 없이 빈 배열을 반환한다", async () => {
    const ctx = createMockContext();
    // DB.prepare().all() 에서 에러 발생
    ctx.cloudflare.env.DB.prepare = vi.fn().mockReturnValue({
      all: vi.fn().mockRejectedValue(new Error("no such table: cron_logs")),
    });

    const response = await loader({
      request: createRequest(),
      context: ctx,
      params: {},
    } as never);

    const data = await response.json();
    expect(data.cronLogs).toEqual([]);
  });
});
