/**
 * Matrix Agent 도구 핸들러 (P2)
 * 3개 도구: queryMatrixHeatmap, getCellSignals, getTopCells
 */
import type { DB } from "~/db";
import { GraphQueryEngine } from "~/lib/graph/query";
import { ScoringService } from "~/features/matrix/service/scoring.service";

// ─── query_matrix_heatmap ─────────────────────────────────────────────────

export interface QueryMatrixHeatmapInput {
  teamId: string;
  horizonFilter?: "short" | "mid" | "long";
}

export async function queryMatrixHeatmap(
  db: DB,
  input: QueryMatrixHeatmapInput,
): Promise<string> {
  const engine = new GraphQueryEngine(db);
  const result = await engine.getHeatmapData(input.teamId, input.horizonFilter);

  return JSON.stringify({
    industries: result.industries.map((n) => ({
      id: n["@id"],
      name: n["name"] ?? n["mx:name"],
    })),
    functions: result.functions.map((n) => ({
      id: n["@id"],
      name: n["name"] ?? n["mx:name"],
    })),
    cellCount: result.cells.length,
    scoreCount: result.scores.length,
    cells: result.cells.slice(0, 20),
  });
}

// ─── get_cell_signals ─────────────────────────────────────────────────────

export interface GetCellSignalsInput {
  teamId: string;
  cellNodeId: string;
}

export async function getCellSignals(
  db: DB,
  input: GetCellSignalsInput,
): Promise<string> {
  const engine = new GraphQueryEngine(db);
  const signals = await engine.getSignalsByCell(input.teamId, input.cellNodeId);

  return JSON.stringify({
    cellNodeId: input.cellNodeId,
    signalCount: signals.length,
    signals: signals.slice(0, 10).map((n) => ({
      id: n["@id"],
      type: n["@type"],
      title: n["title"] ?? n["dx:title"] ?? n["name"] ?? "(제목 없음)",
      status: n["status"] ?? n["dx:status"],
    })),
  });
}

// ─── get_top_cells ────────────────────────────────────────────────────────

export interface GetTopCellsInput {
  teamId: string;
  limit?: number;
}

export async function getTopCells(
  db: DB,
  input: GetTopCellsInput,
): Promise<string> {
  const service = new ScoringService(db);
  const limit = Math.min(input.limit ?? 10, 20);
  const cells = await service.getTopCells(input.teamId, limit);

  return JSON.stringify({
    count: cells.length,
    cells: cells.map((c) => ({
      cellId: c.cellId,
      industry: c.industryName,
      function: c.functionName,
      compositeScore: c.compositeScore,
      pipelineStage: c.pipelineStage,
    })),
  });
}
