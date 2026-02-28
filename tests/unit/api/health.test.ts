/**
 * /api/health 엔드포인트 테스트
 * DB 정상/에러, FF 반환, 타임스탬프 ISO8601 검증
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { loader } from "~/routes/api.health";

// ─── Mock ──────────────────────────────────────────────────────────

vi.mock("~/db", () => ({
  getDb: vi.fn(),
}));

import { getDb } from "~/db";

const mockGetDb = vi.mocked(getDb);

function makeContext(overrides: {
  dbRunResult?: unknown;
  dbRunError?: Error;
  envVars?: Record<string, string>;
  vectorize?: boolean;
}) {
  const runMock = overrides.dbRunError
    ? vi.fn().mockRejectedValue(overrides.dbRunError)
    : vi.fn().mockResolvedValue(overrides.dbRunResult ?? { rows: [] });

  mockGetDb.mockReturnValue({ run: runMock } as unknown as ReturnType<typeof getDb>);

  const env: Record<string, unknown> = {
    DB: {},
    FF_GRAPH_LAYER: "true",
    FF_AGENT_DO: "false",
    FF_TOPIC_COLLAB: "true",
    FF_ACL_SCOPE: "true",
    FF_MEMORY_LIFECYCLE: "true",
    FF_VECTORIZE_SEARCH: "true",
    FF_PIPELINE_BRIDGE: "true",
    FF_COLLAB_WORKER: "true",
    FF_PROFILE_LEARNER: "true",
    ...overrides.envVars,
  };

  if (overrides.vectorize) {
    env.VECTORIZE_GRAPHS = { query: vi.fn(), upsert: vi.fn() };
  }

  return {
    request: new Request("http://localhost/api/health"),
    params: {},
    context: { cloudflare: { env } },
  } as unknown as Parameters<typeof loader>[0];
}

// ─── 테스트 ──────────────────────────────────────────────────────────

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("DB 정상 시 healthy 응답 반환", async () => {
    const args = makeContext({});
    const response = await loader(args);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("healthy");
    expect(body.checks.database.status).toBe("ok");
    expect(body.checks.database.latencyMs).toBeGreaterThanOrEqual(0);
    expect(body.version).toBe("v6.15");
    expect(body.checks.cronEndpoints).toBe(19);
  });

  it("DB 에러 시 degraded 응답 반환", async () => {
    const args = makeContext({
      dbRunError: new Error("D1_ERROR: connection failed"),
    });
    const response = await loader(args);
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe("degraded");
    expect(body.checks.database.status).toBe("error");
    expect(body.checks.database.error).toBe("D1_ERROR: connection failed");
    expect(body.checks.database.latencyMs).toBe(-1);
  });

  it("Feature Flag 상태 10개 반환", async () => {
    const args = makeContext({});
    const response = await loader(args);
    const body = await response.json();
    const ff = body.checks.featureFlags;

    expect(Object.keys(ff)).toHaveLength(10);
    expect(ff.graphLayer).toBe(true);
    expect(ff.agentDO).toBe(false);
    expect(ff.collabWorker).toBe(true);
  });

  it("타임스탬프 ISO8601 형식 검증", async () => {
    const args = makeContext({});
    const response = await loader(args);
    const body = await response.json();

    // ISO 8601 패턴: YYYY-MM-DDTHH:mm:ss.sssZ
    const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
    expect(body.timestamp).toMatch(iso8601Regex);
  });

  it("Vectorize 바인딩 있으면 ok 반환", async () => {
    const args = makeContext({ vectorize: true });
    const response = await loader(args);
    const body = await response.json();

    expect(body.checks.vectorize.status).toBe("ok");
  });

  it("Vectorize 바인딩 없으면 unavailable 반환", async () => {
    const args = makeContext({ vectorize: false });
    const response = await loader(args);
    const body = await response.json();

    expect(body.checks.vectorize.status).toBe("unavailable");
  });
});
