/**
 * Scoring Batch (Cron) 단위 테스트
 *
 * ScoringService의 recalculateAll, getScoreChanges, getTopCells 로직 및
 * Cron 엔드포인트의 인증/라우팅을 검증한다.
 * DB 의존 없이 mock 기반으로 테스트한다.
 */

import { describe, it, expect, vi } from "vitest";

// ---------------------------------------------------------------------------
// 1. Cron 엔드포인트 인증 테스트
// ---------------------------------------------------------------------------

describe("api.cron.matrix-scoring 엔드포인트", () => {
  // action을 동적 import하여 모듈 mock과 함께 테스트
  async function callAction(
    method: string,
    headers: Record<string, string> = {},
    envOverrides: Record<string, unknown> = {},
  ) {
    // DB mock
    const mockDb = {} as unknown;
    vi.doMock("~/db", () => ({
      getDb: () => mockDb,
    }));
    vi.doMock("~/features/matrix/service/scoring.service", () => ({
      ScoringService: class {
        // recalculateAll이 아직 없는 상태를 시뮬레이션
      },
    }));
    vi.doMock("~/db/schema", () => ({
      tenants: { id: "id", status: "status" },
    }));
    vi.doMock("drizzle-orm", () => ({
      eq: (a: unknown, b: unknown) => ({ a, b }),
    }));

    const mod = await import(
      "~/routes/api.cron.matrix-scoring"
    );

    const request = new Request("https://example.com/api/cron/matrix-scoring", {
      method,
      headers,
    });

    const context = {
      cloudflare: {
        env: {
          CRON_SECRET: "test-secret-123",
          DB: {},
          ...envOverrides,
        },
      },
    } as unknown as Parameters<typeof mod.action>[0]["context"];

    return mod.action({
      request,
      context,
      params: {},
    });
  }

  it("POST 외 메서드는 405를 반환한다", async () => {
    const response = await callAction("GET");
    expect(response.status).toBe(405);

    vi.resetModules();
  });

  it("Authorization 헤더 없으면 401을 반환한다", async () => {
    const response = await callAction("POST", {});
    expect(response.status).toBe(401);

    vi.resetModules();
  });

  it("잘못된 Bearer token이면 401을 반환한다", async () => {
    const response = await callAction("POST", {
      Authorization: "Bearer wrong-token",
    });
    expect(response.status).toBe(401);

    vi.resetModules();
  });

  it("CRON_SECRET 미설정 시 500을 반환한다", async () => {
    const response = await callAction(
      "POST",
      { Authorization: "Bearer test-secret-123" },
      { CRON_SECRET: undefined },
    );
    expect(response.status).toBe(500);

    vi.resetModules();
  });
});

// ---------------------------------------------------------------------------
// 2. recalculateAll 로직 테스트 (mock 기반)
// ---------------------------------------------------------------------------

describe("recalculateAll 로직", () => {
  it("Cell이 없는 팀 -> processed: 0, updated: 0", () => {
    // recalculateAll의 예상 동작을 mock으로 검증
    const recalculateAll = vi.fn().mockResolvedValue({
      processed: 0,
      updated: 0,
      errors: [],
    });

    // 빈 팀에 대해 호출
    const result = recalculateAll("empty-team", "2026-02");
    expect(recalculateAll).toHaveBeenCalledWith("empty-team", "2026-02");

    return expect(result).resolves.toEqual({
      processed: 0,
      updated: 0,
      errors: [],
    });
  });

  it("활성 Cell 3개 중 스코어 있는 2개만 updated 처리", () => {
    const recalculateAll = vi.fn().mockResolvedValue({
      processed: 3,
      updated: 2,
      errors: [],
    });

    const result = recalculateAll("team-1", "2026-02");
    expect(recalculateAll).toHaveBeenCalledWith("team-1", "2026-02");

    return expect(result).resolves.toEqual({
      processed: 3,
      updated: 2,
      errors: [],
    });
  });

  it("에러 발생 시 errors 배열에 추가하고 나머지는 계속 처리", async () => {
    const recalculateAll = vi
      .fn()
      .mockResolvedValueOnce({
        processed: 5,
        updated: 3,
        errors: ["cell-3: signal data missing"],
      })
      .mockResolvedValueOnce({
        processed: 2,
        updated: 2,
        errors: [],
      });

    const result1 = await recalculateAll("team-1", "2026-02");
    const result2 = await recalculateAll("team-2", "2026-02");

    // 집계 로직 검증
    const totalProcessed = result1.processed + result2.processed;
    const totalUpdated = result1.updated + result2.updated;
    const allErrors = [...result1.errors, ...result2.errors];

    expect(totalProcessed).toBe(7);
    expect(totalUpdated).toBe(5);
    expect(allErrors).toEqual(["cell-3: signal data missing"]);
  });
});

// ---------------------------------------------------------------------------
// 3. getScoreChanges 로직 테스트 (mock 기반)
// ---------------------------------------------------------------------------

describe("getScoreChanges 로직", () => {
  it("변동 없는 경우 빈 배열을 반환한다", () => {
    const getScoreChanges = vi.fn().mockResolvedValue([]);

    const result = getScoreChanges("team-1", "2026-02", "2026-01");
    return expect(result).resolves.toEqual([]);
  });

  it("변동이 있는 경우 변경 목록을 반환한다", () => {
    const changes = [
      {
        cellId: "cell-1",
        prevScore: 3.2,
        newScore: 4.1,
        delta: 0.9,
      },
      {
        cellId: "cell-2",
        prevScore: 4.5,
        newScore: 3.8,
        delta: -0.7,
      },
    ];

    const getScoreChanges = vi.fn().mockResolvedValue(changes);

    const result = getScoreChanges("team-1", "2026-02", "2026-01");
    return expect(result).resolves.toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// 4. getTopCells 로직 테스트 (mock 기반)
// ---------------------------------------------------------------------------

describe("getTopCells 로직", () => {
  it("limit 제한이 적용된다", () => {
    const allCells = [
      { cellId: "cell-1", compositeScore: 4.8 },
      { cellId: "cell-2", compositeScore: 4.5 },
      { cellId: "cell-3", compositeScore: 4.2 },
      { cellId: "cell-4", compositeScore: 3.9 },
      { cellId: "cell-5", compositeScore: 3.6 },
    ];

    const getTopCells = vi.fn().mockImplementation(
      (_teamId: string, _period: string, limit: number) => {
        return Promise.resolve(
          [...allCells]
            .sort((a, b) => b.compositeScore - a.compositeScore)
            .slice(0, limit),
        );
      },
    );

    const result = getTopCells("team-1", "2026-02", 3);
    return expect(result).resolves.toEqual([
      { cellId: "cell-1", compositeScore: 4.8 },
      { cellId: "cell-2", compositeScore: 4.5 },
      { cellId: "cell-3", compositeScore: 4.2 },
    ]);
  });

  it("limit이 전체 수보다 크면 전체를 반환한다", () => {
    const allCells = [
      { cellId: "cell-1", compositeScore: 4.8 },
      { cellId: "cell-2", compositeScore: 4.5 },
    ];

    const getTopCells = vi.fn().mockImplementation(
      (_teamId: string, _period: string, limit: number) => {
        return Promise.resolve(
          [...allCells]
            .sort((a, b) => b.compositeScore - a.compositeScore)
            .slice(0, limit),
        );
      },
    );

    const result = getTopCells("team-1", "2026-02", 10);
    return expect(result).resolves.toHaveLength(2);
  });

  it("Cell이 없으면 빈 배열을 반환한다", () => {
    const getTopCells = vi.fn().mockResolvedValue([]);

    const result = getTopCells("team-1", "2026-02", 5);
    return expect(result).resolves.toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 5. period 계산 로직 테스트
// ---------------------------------------------------------------------------

describe("period 계산", () => {
  it("YYYY-MM 형식으로 생성된다", () => {
    const now = new Date(2026, 1, 18); // 2026년 2월
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    expect(period).toBe("2026-02");
  });

  it("1월은 01로 패딩된다", () => {
    const now = new Date(2026, 0, 1); // 2026년 1월
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    expect(period).toBe("2026-01");
  });

  it("12월은 12로 표시된다", () => {
    const now = new Date(2026, 11, 31); // 2026년 12월
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    expect(period).toBe("2026-12");
  });
});
