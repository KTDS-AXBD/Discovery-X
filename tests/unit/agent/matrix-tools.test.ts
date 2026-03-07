/**
 * Matrix Agent 도구 핸들러 테스트 (P2)
 *
 * 테스트 대상:
 * - queryMatrixHeatmap: getHeatmapData 호출 검증, 빈 결과 처리
 * - getCellSignals: getSignalsByCell 호출 검증, 빈 결과 처리
 * - getTopCells: getTopCells 호출 검증, limit 초과(>20) 클램핑
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DB } from "~/db";

// vi.hoisted(): mock factory 호이스팅 전에 변수를 준비
const { mockGetHeatmapData, mockGetSignalsByCell, mockScoringGetTopCells } =
  vi.hoisted(() => ({
    mockGetHeatmapData: vi.fn(),
    mockGetSignalsByCell: vi.fn(),
    mockScoringGetTopCells: vi.fn(),
  }));

// 클래스 모킹 — 일반 함수(constructor)로 지정해야 new 호출이 가능
vi.mock("~/lib/graph/query", () => ({
  GraphQueryEngine: vi.fn(function (
    this: Record<string, unknown>,
  ) {
    this.getHeatmapData = mockGetHeatmapData;
    this.getSignalsByCell = mockGetSignalsByCell;
  }),
}));

vi.mock("~/lib/services/scoring.service", () => ({
  ScoringService: vi.fn(function (
    this: Record<string, unknown>,
  ) {
    this.getTopCells = mockScoringGetTopCells;
  }),
}));

import {
  queryMatrixHeatmap,
  getCellSignals,
  getTopCells,
} from "~/features/chat/agent/tools/matrix-tools";

const fakeDb = {} as unknown as DB;

// ─── queryMatrixHeatmap ───────────────────────────────────────────────────

describe("queryMatrixHeatmap", () => {
  beforeEach(() => {
    mockGetHeatmapData.mockReset();
  });

  it("getHeatmapData를 teamId로 호출한다", async () => {
    mockGetHeatmapData.mockResolvedValue({
      industries: [{ "@id": "ind/mfg", "name": "제조" }],
      functions: [{ "@id": "fn/ops", "mx:name": "운영" }],
      cells: [{ "@id": "cell/mfg/ops", "@type": "mx:Cell" }],
      scores: [{ "@id": "score/1", "@type": "mx:Score" }],
    });

    const result = JSON.parse(
      await queryMatrixHeatmap(fakeDb, { teamId: "team-1" }),
    );

    expect(mockGetHeatmapData).toHaveBeenCalledWith("team-1", undefined);
    expect(result.industries).toHaveLength(1);
    expect(result.industries[0]).toEqual({ id: "ind/mfg", name: "제조" });
    expect(result.functions[0]).toEqual({ id: "fn/ops", name: "운영" });
    expect(result.cellCount).toBe(1);
    expect(result.scoreCount).toBe(1);
  });

  it("horizonFilter를 전달하면 getHeatmapData에 포함된다", async () => {
    mockGetHeatmapData.mockResolvedValue({
      industries: [],
      functions: [],
      cells: [],
      scores: [],
    });

    await queryMatrixHeatmap(fakeDb, {
      teamId: "team-2",
      horizonFilter: "short",
    });

    expect(mockGetHeatmapData).toHaveBeenCalledWith("team-2", "short");
  });

  it("빈 결과를 올바르게 처리한다", async () => {
    mockGetHeatmapData.mockResolvedValue({
      industries: [],
      functions: [],
      cells: [],
      scores: [],
    });

    const result = JSON.parse(
      await queryMatrixHeatmap(fakeDb, { teamId: "team-empty" }),
    );

    expect(result.industries).toHaveLength(0);
    expect(result.functions).toHaveLength(0);
    expect(result.cellCount).toBe(0);
    expect(result.scoreCount).toBe(0);
    expect(result.cells).toHaveLength(0);
  });

  it("cells가 20개를 초과하면 최대 20개만 반환한다", async () => {
    const manyCells = Array.from({ length: 30 }, (_, i) => ({
      "@id": `cell/${i}`,
      "@type": "mx:Cell",
    }));

    mockGetHeatmapData.mockResolvedValue({
      industries: [],
      functions: [],
      cells: manyCells,
      scores: [],
    });

    const result = JSON.parse(
      await queryMatrixHeatmap(fakeDb, { teamId: "team-many" }),
    );

    expect(result.cellCount).toBe(30);
    expect(result.cells).toHaveLength(20);
  });
});

// ─── getCellSignals ───────────────────────────────────────────────────────

describe("getCellSignals", () => {
  beforeEach(() => {
    mockGetSignalsByCell.mockReset();
  });

  it("getSignalsByCell을 teamId와 cellNodeId로 호출한다", async () => {
    mockGetSignalsByCell.mockResolvedValue([
      {
        "@id": "signal/1",
        "@type": "dx:Signal",
        title: "시그널 타이틀",
        status: "active",
      },
    ]);

    const result = JSON.parse(
      await getCellSignals(fakeDb, {
        teamId: "team-1",
        cellNodeId: "cell/mfg/ops",
      }),
    );

    expect(mockGetSignalsByCell).toHaveBeenCalledWith("team-1", "cell/mfg/ops");
    expect(result.cellNodeId).toBe("cell/mfg/ops");
    expect(result.signalCount).toBe(1);
    expect(result.signals[0]).toMatchObject({
      id: "signal/1",
      type: "dx:Signal",
      title: "시그널 타이틀",
      status: "active",
    });
  });

  it("빈 결과를 올바르게 처리한다", async () => {
    mockGetSignalsByCell.mockResolvedValue([]);

    const result = JSON.parse(
      await getCellSignals(fakeDb, {
        teamId: "team-1",
        cellNodeId: "cell/unknown",
      }),
    );

    expect(result.signalCount).toBe(0);
    expect(result.signals).toHaveLength(0);
  });

  it("signals가 10개를 초과하면 최대 10개만 반환한다", async () => {
    const manySignals = Array.from({ length: 15 }, (_, i) => ({
      "@id": `signal/${i}`,
      "@type": "dx:Signal",
      title: `시그널 ${i}`,
    }));

    mockGetSignalsByCell.mockResolvedValue(manySignals);

    const result = JSON.parse(
      await getCellSignals(fakeDb, {
        teamId: "team-1",
        cellNodeId: "cell/mfg/ops",
      }),
    );

    expect(result.signalCount).toBe(15);
    expect(result.signals).toHaveLength(10);
  });

  it("title 필드가 없으면 dx:title → name → 기본값을 사용한다", async () => {
    mockGetSignalsByCell.mockResolvedValue([
      { "@id": "s1", "@type": "dx:Signal", "dx:title": "DX 제목" },
      { "@id": "s2", "@type": "dx:Signal", "name": "이름" },
      { "@id": "s3", "@type": "dx:Signal" },
    ]);

    const result = JSON.parse(
      await getCellSignals(fakeDb, { teamId: "t", cellNodeId: "c" }),
    );

    expect(result.signals[0].title).toBe("DX 제목");
    expect(result.signals[1].title).toBe("이름");
    expect(result.signals[2].title).toBe("(제목 없음)");
  });
});

// ─── getTopCells ──────────────────────────────────────────────────────────

describe("getTopCells", () => {
  beforeEach(() => {
    mockScoringGetTopCells.mockReset();
  });

  it("getTopCells를 teamId와 default limit(10)으로 호출한다", async () => {
    mockScoringGetTopCells.mockResolvedValue([]);

    await getTopCells(fakeDb, { teamId: "team-1" });

    expect(mockScoringGetTopCells).toHaveBeenCalledWith("team-1", 10);
  });

  it("limit 지정 시 해당 값을 전달한다", async () => {
    mockScoringGetTopCells.mockResolvedValue([]);

    await getTopCells(fakeDb, { teamId: "team-1", limit: 5 });

    expect(mockScoringGetTopCells).toHaveBeenCalledWith("team-1", 5);
  });

  it("limit이 20을 초과하면 20으로 클램핑한다", async () => {
    mockScoringGetTopCells.mockResolvedValue([]);

    await getTopCells(fakeDb, { teamId: "team-1", limit: 99 });

    expect(mockScoringGetTopCells).toHaveBeenCalledWith("team-1", 20);
  });

  it("결과를 올바른 형태로 직렬화한다", async () => {
    mockScoringGetTopCells.mockResolvedValue([
      {
        cellId: "cell-uuid-1",
        industryName: "제조",
        functionName: "운영",
        compositeScore: 8.5,
        pipelineStage: "explore",
      },
      {
        cellId: "cell-uuid-2",
        industryName: "금융",
        functionName: "마케팅",
        compositeScore: 7.2,
        pipelineStage: "validate",
      },
    ]);

    const result = JSON.parse(
      await getTopCells(fakeDb, { teamId: "team-1", limit: 10 }),
    );

    expect(result.count).toBe(2);
    expect(result.cells[0]).toEqual({
      cellId: "cell-uuid-1",
      industry: "제조",
      function: "운영",
      compositeScore: 8.5,
      pipelineStage: "explore",
    });
  });

  it("빈 결과를 올바르게 처리한다", async () => {
    mockScoringGetTopCells.mockResolvedValue([]);

    const result = JSON.parse(
      await getTopCells(fakeDb, { teamId: "team-empty" }),
    );

    expect(result.count).toBe(0);
    expect(result.cells).toHaveLength(0);
  });
});
