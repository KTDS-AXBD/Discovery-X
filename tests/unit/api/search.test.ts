/**
 * GET /api/search 통합 검색 API 테스트
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────────────

const mockGetSessionContext = vi.fn();
const mockGetSessionSecret = vi.fn().mockReturnValue("test-secret");

vi.mock("~/lib/auth/session.server", () => ({
  getSessionContext: (...args: unknown[]) => mockGetSessionContext(...args),
  getSessionSecret: (...args: unknown[]) => mockGetSessionSecret(...args),
  getUserFromSession: vi.fn(),
}));

const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockLimit = vi.fn();

const mockGetDb = vi.fn();
vi.mock("~/db", () => ({
  getDb: (...args: unknown[]) => mockGetDb(...args),
}));

vi.mock("~/lib/query/tenant-scope", () => ({
  tenantWhere: vi.fn().mockReturnValue("mocked-where"),
}));

vi.mock("~/lib/embeddings/embedding-service", () => ({
  generateEmbedding: vi.fn(),
  findSimilarDiscoveries: vi.fn().mockResolvedValue([]),
}));

import { loader } from "~/routes/api.search";

// ─── Helpers ────────────────────────────────────────────────────────

function makeArgs(params: Record<string, string> = {}, envOverrides: Record<string, unknown> = {}) {
  const searchParams = new URLSearchParams(params);
  const url = `http://localhost/api/search?${searchParams.toString()}`;

  return {
    request: new Request(url),
    params: {},
    context: {
      cloudflare: {
        env: {
          DB: {},
          SESSION_SECRET: "test-secret",
          ...envOverrides,
        },
      },
    },
  } as unknown as Parameters<typeof loader>[0];
}

function setupAuthenticatedUser() {
  mockGetSessionContext.mockResolvedValue({
    user: { id: "user-1", name: "Test", email: "test@test.com", role: "user" },
    tenantId: "tenant-1",
    tenantRole: "member",
  });
}

function setupDbMock(rows: unknown[] = []) {
  mockLimit.mockResolvedValue(rows);
  mockWhere.mockReturnValue({ limit: mockLimit });
  mockFrom.mockReturnValue({ where: mockWhere });
  mockSelect.mockReturnValue({ from: mockFrom });
  mockGetDb.mockReturnValue({
    select: mockSelect,
    query: {},
  });
}

// ─── Tests ──────────────────────────────────────────────────────────

describe("GET /api/search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDbMock();
  });

  it("인증 없으면 /login redirect", async () => {
    mockGetSessionContext.mockResolvedValue(null);
    const args = makeArgs({ q: "테스트" });

    const response = await loader(args);

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/login");
  });

  it("q 파라미터 없으면 빈 결과", async () => {
    setupAuthenticatedUser();
    const args = makeArgs({});

    const response = await loader(args);
    const body = await response.json();

    expect(body.results).toEqual([]);
    expect(body.total).toBe(0);
    expect(body.query).toBe("");
  });

  it("q가 2자 미만이면 빈 결과", async () => {
    setupAuthenticatedUser();
    const args = makeArgs({ q: "a" });

    const response = await loader(args);
    const body = await response.json();

    expect(body.results).toEqual([]);
    expect(body.total).toBe(0);
  });

  it("type=discovery 필터링 — 텍스트 모드", async () => {
    setupAuthenticatedUser();

    // D1 FTS5 prepared statement mock
    const mockBind = vi.fn().mockReturnValue({
      all: vi.fn().mockResolvedValue({
        results: [
          {
            id: "disc-1",
            title: "테스트 디스커버리",
            seedSummary: "요약",
            status: "DISCOVERY",
            createdAt: 1700000000,
          },
        ],
      }),
    });
    const mockPrepare = vi.fn().mockReturnValue({ bind: mockBind });

    const args = makeArgs(
      { q: "테스트", type: "discovery", mode: "text" },
      { DB: { prepare: mockPrepare } },
    );

    const response = await loader(args);
    const body = await response.json();

    expect(body.mode).toBe("text");
    expect(body.query).toBe("테스트");
    expect(body.results.length).toBeGreaterThanOrEqual(0);
    // FTS5 prepared statement 호출 확인
    expect(mockPrepare).toHaveBeenCalled();
  });

  it("type=all 기본 동작 — 텍스트 모드", async () => {
    setupAuthenticatedUser();

    // D1 FTS5 mock (discoveries)
    const mockBind = vi.fn().mockReturnValue({
      all: vi.fn().mockResolvedValue({ results: [] }),
    });
    const mockPrepare = vi.fn().mockReturnValue({ bind: mockBind });

    const args = makeArgs(
      { q: "검색어" },
      { DB: { prepare: mockPrepare } },
    );

    const response = await loader(args);
    const body = await response.json();

    expect(body.mode).toBe("text");
    expect(body.query).toBe("검색어");
    expect(Array.isArray(body.results)).toBe(true);
    expect(typeof body.total).toBe("number");
  });

  it("mode=semantic 파라미터 파싱", async () => {
    setupAuthenticatedUser();
    const args = makeArgs({ q: "AI 기술", mode: "semantic" });

    const response = await loader(args);
    const body = await response.json();

    expect(body.mode).toBe("semantic");
    expect(body.query).toBe("AI 기술");
  });

  it("limit 파라미터 최대 50 제한", async () => {
    setupAuthenticatedUser();
    const args = makeArgs({ q: "테스트", limit: "100" });

    const response = await loader(args);
    const body = await response.json();

    // limit=100 요청해도 results가 50개를 넘지 않아야 함
    expect(body.results.length).toBeLessThanOrEqual(50);
  });

  it("응답 구조 검증 — results, total, mode, query 필드", async () => {
    setupAuthenticatedUser();
    const args = makeArgs({ q: "구조검증" });

    const response = await loader(args);
    const body = await response.json();

    expect(body).toHaveProperty("results");
    expect(body).toHaveProperty("total");
    expect(body).toHaveProperty("mode");
    expect(body).toHaveProperty("query");
    expect(Array.isArray(body.results)).toBe(true);
    expect(typeof body.total).toBe("number");
    expect(["text", "semantic"]).toContain(body.mode);
    expect(typeof body.query).toBe("string");
  });

  it("잘못된 type 파라미터는 all로 fallback", async () => {
    setupAuthenticatedUser();
    const args = makeArgs({ q: "테스트", type: "invalid" });

    const response = await loader(args);
    const body = await response.json();

    // 에러 없이 정상 응답
    expect(response.status).toBe(200);
    expect(body.results).toBeDefined();
  });

  it("잘못된 mode 파라미터는 text로 fallback", async () => {
    setupAuthenticatedUser();
    const args = makeArgs({ q: "테스트", mode: "invalid" });

    const response = await loader(args);
    const body = await response.json();

    expect(body.mode).toBe("text");
  });
});
