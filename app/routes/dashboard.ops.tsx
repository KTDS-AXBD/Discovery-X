/**
 * /dashboard/ops — Operational Dashboard
 * 3-패널 레이아웃: 실행 현황 / 리스크 매트릭스 / 팀원별 담당 Cell
 */

import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useLoaderData, Link } from "@remix-run/react";
import { eq } from "drizzle-orm";
import { getDb } from "~/db";
import { users } from "~/db/schema";
import {
  matrixCells,
  industries,
  functions,
  STAGE_GATE_MAP,
} from "~/features/matrix/db/schema";
import {
  STAGE_GATE_LABELS,
  getScoreLevel,
} from "~/features/matrix/types";
import { MatrixService } from "~/lib/services/matrix.service";
import {
  getSessionContext,
  getSessionSecret,
} from "~/lib/auth/session.server";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

interface StageGroup {
  stage: string;
  label: string;
  cells: Array<{
    cellId: string;
    industryName: string;
    functionName: string;
    compositeScore: number | null;
    pipelineStage: string | null;
  }>;
}

interface RiskCell {
  cellId: string;
  industryName: string;
  functionName: string;
  compositeScore: number | null;
  cellStatus: string | null;
  reason: string;
}

interface OwnerGroup {
  ownerName: string;
  cells: Array<{
    cellId: string;
    industryName: string;
    functionName: string;
    compositeScore: number | null;
  }>;
  avgScore: number | null;
}

interface LoaderData {
  stageGroups: StageGroup[];
  riskCells: RiskCell[];
  ownerGroups: OwnerGroup[];
  totalCells: number;
  activeCells: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Loader
// ────────────────────────────────────────────────────────────────────────────

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);

  const emptyData: LoaderData = {
    stageGroups: [],
    riskCells: [],
    ownerGroups: [],
    totalCells: 0,
    activeCells: 0,
  };

  try {
    const ctx = await getSessionContext(request, db, secret);
    if (!ctx) return json(emptyData);

    const teamId = ctx.tenantId;
    const matrixService = new MatrixService(db);

    // 1. Heatmap 데이터 (Cell + compositeScore + industry/function names)
    const heatmap = await matrixService.getHeatmapData(teamId);
    const heatmapCells = heatmap.cells;

    // 2. Stage별 그룹화 (S0~S4)
    const stageMap = new Map<string, StageGroup>();
    const stageOrder = ["S0", "S1", "S2", "S3", "S4"];
    for (const s of stageOrder) {
      stageMap.set(s, {
        stage: s,
        label: STAGE_GATE_LABELS[s] ?? s,
        cells: [],
      });
    }

    for (const cell of heatmapCells) {
      if (!cell.cellId) continue;
      const stage =
        STAGE_GATE_MAP[cell.pipelineStage as keyof typeof STAGE_GATE_MAP] ??
        "S0";
      const group = stageMap.get(stage);
      if (group) {
        group.cells.push({
          cellId: cell.cellId,
          industryName: cell.industryName,
          functionName: cell.functionName,
          compositeScore: cell.compositeScore,
          pipelineStage: cell.pipelineStage,
        });
      }
    }

    const stageGroups = stageOrder
      .map((s) => stageMap.get(s)!)
      .filter(Boolean);

    // 3. 리스크 Cell 식별
    const riskCells: RiskCell[] = [];
    for (const cell of heatmapCells) {
      if (!cell.cellId) continue;
      const reasons: string[] = [];

      if (cell.compositeScore !== null && cell.compositeScore < 2.5) {
        reasons.push("낮은 스코어");
      }
      if (cell.cellStatus === "watching") {
        reasons.push("모니터링 중");
      }

      if (reasons.length > 0) {
        riskCells.push({
          cellId: cell.cellId,
          industryName: cell.industryName,
          functionName: cell.functionName,
          compositeScore: cell.compositeScore,
          cellStatus: cell.cellStatus,
          reason: reasons.join(", "),
        });
      }
    }

    // compositeScore 오름차순 (낮은 것이 먼저)
    riskCells.sort((a, b) => (a.compositeScore ?? 0) - (b.compositeScore ?? 0));

    // 4. 팀원별 담당 Cell (ownerId → users.name 조인)
    const cellsWithOwner = await db
      .select({
        cellId: matrixCells.id,
        ownerId: matrixCells.ownerId,
        ownerName: users.name,
        industryName: industries.name,
        functionName: functions.name,
      })
      .from(matrixCells)
      .leftJoin(users, eq(matrixCells.ownerId, users.id))
      .innerJoin(industries, eq(matrixCells.industryId, industries.id))
      .innerJoin(functions, eq(matrixCells.functionId, functions.id))
      .where(eq(matrixCells.teamId, teamId));

    // compositeScore는 heatmap에서 이미 가져온 데이터 활용
    const scoreMap = new Map<string, number | null>();
    for (const cell of heatmapCells) {
      if (cell.cellId) {
        scoreMap.set(cell.cellId, cell.compositeScore);
      }
    }

    // Owner별 그룹화
    const ownerMap = new Map<string, OwnerGroup>();
    for (const row of cellsWithOwner) {
      const name = row.ownerName ?? "미배정";
      if (!ownerMap.has(name)) {
        ownerMap.set(name, { ownerName: name, cells: [], avgScore: null });
      }
      ownerMap.get(name)!.cells.push({
        cellId: row.cellId,
        industryName: row.industryName,
        functionName: row.functionName,
        compositeScore: scoreMap.get(row.cellId) ?? null,
      });
    }

    // 평균 스코어 계산
    const ownerGroups = Array.from(ownerMap.values()).map((group) => {
      const scored = group.cells.filter((c) => c.compositeScore !== null);
      const avg =
        scored.length > 0
          ? scored.reduce((sum, c) => sum + c.compositeScore!, 0) / scored.length
          : null;
      return { ...group, avgScore: avg ? Math.round(avg * 100) / 100 : null };
    });

    // "미배정" 그룹을 마지막으로
    ownerGroups.sort((a, b) => {
      if (a.ownerName === "미배정") return 1;
      if (b.ownerName === "미배정") return -1;
      return a.ownerName.localeCompare(b.ownerName, "ko");
    });

    const activeCells = heatmapCells.filter(
      (c) => c.cellStatus === "active" || c.cellStatus === "watching",
    ).length;

    return json<LoaderData>({
      stageGroups,
      riskCells,
      ownerGroups,
      totalCells: heatmapCells.length,
      activeCells,
    });
  } catch (error) {
    console.error(
      "[dashboard.ops.loader] Error:",
      error instanceof Error ? error.message : error,
    );
    return json(emptyData);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// UI Components
// ────────────────────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number | null }) {
  const level = getScoreLevel(score);
  const colorClass =
    level === "high"
      ? "text-green-600 bg-green-50"
      : level === "medium"
        ? "text-yellow-600 bg-yellow-50"
        : level === "low"
          ? "text-red-600 bg-red-50"
          : "text-gray-400 bg-gray-50";

  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${colorClass}`}
    >
      {score !== null ? score.toFixed(1) : "-"}
    </span>
  );
}

function SectionHeader({
  title,
  count,
}: {
  title: string;
  count?: number;
}) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <h3 className="text-sm font-semibold text-[--axis-text-primary]">
        {title}
      </h3>
      {count !== undefined && (
        <span className="rounded-full bg-[--axis-surface-secondary] px-2 py-0.5 text-xs text-[--axis-text-secondary]">
          {count}
        </span>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Page
// ────────────────────────────────────────────────────────────────────────────

export default function OpsPage() {
  const { stageGroups, riskCells, ownerGroups, totalCells, activeCells } =
    useLoaderData<typeof loader>();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-[--axis-text-primary]">
          운영 대시보드
        </h2>
        <p className="mt-1 text-sm text-[--axis-text-secondary]">
          전체 {totalCells}개 Cell / 활성 {activeCells}개
        </p>
      </div>

      {/* 3-Panel Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Panel 1: Pipeline Progress */}
        <div className="rounded-lg border border-[--axis-border-primary] bg-[--axis-surface-primary] p-4">
          <SectionHeader title="실행 현황" count={totalCells} />
          <div className="space-y-3">
            {stageGroups.map((group) => (
              <div key={group.stage}>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-medium text-[--axis-text-secondary]">
                    {group.stage} {group.label}
                  </span>
                  <span className="text-xs font-semibold text-[--axis-text-primary]">
                    {group.cells.length}
                  </span>
                </div>
                {group.cells.length > 0 ? (
                  <ul className="space-y-1">
                    {group.cells.map((cell) => (
                      <li key={cell.cellId}>
                        <Link
                          to={`/lab/matrix/${cell.cellId}`}
                          className="flex items-center justify-between rounded px-2 py-1 text-xs hover:bg-[--axis-surface-secondary] transition-colors"
                        >
                          <span className="truncate text-[--axis-text-primary]">
                            {cell.industryName} x {cell.functionName}
                          </span>
                          <ScoreBadge score={cell.compositeScore} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-2 text-xs text-[--axis-text-tertiary]">
                    해당 단계 Cell 없음
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Panel 2: Risk Monitor */}
        <div className="rounded-lg border border-[--axis-border-primary] bg-[--axis-surface-primary] p-4">
          <SectionHeader title="리스크 매트릭스" count={riskCells.length} />
          {riskCells.length > 0 ? (
            <ul className="space-y-2">
              {riskCells.map((cell) => {
                const level = getScoreLevel(cell.compositeScore);
                const bgClass =
                  level === "low"
                    ? "bg-red-50 border-red-200"
                    : level === "medium"
                      ? "bg-yellow-50 border-yellow-200"
                      : "bg-green-50 border-green-200";

                return (
                  <li key={cell.cellId}>
                    <Link
                      to={`/lab/matrix/${cell.cellId}`}
                      className={`block rounded-md border p-2 transition-opacity hover:opacity-80 ${bgClass}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-gray-900">
                          {cell.industryName} x {cell.functionName}
                        </span>
                        <ScoreBadge score={cell.compositeScore} />
                      </div>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {cell.reason}
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="flex h-24 items-center justify-center">
              <p className="text-sm text-[--axis-text-tertiary]">
                리스크 Cell 없음
              </p>
            </div>
          )}
        </div>

        {/* Panel 3: Team Assignment */}
        <div className="rounded-lg border border-[--axis-border-primary] bg-[--axis-surface-primary] p-4">
          <SectionHeader title="팀원별 담당 Cell" count={ownerGroups.length} />
          <div className="space-y-3">
            {ownerGroups.length > 0 ? (
              ownerGroups.map((group) => (
                <div key={group.ownerName}>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span
                      className={`text-xs font-medium ${
                        group.ownerName === "미배정"
                          ? "text-orange-500"
                          : "text-[--axis-text-primary]"
                      }`}
                    >
                      {group.ownerName}
                    </span>
                    <span className="text-xs text-[--axis-text-secondary]">
                      {group.cells.length}개
                      {group.avgScore !== null && (
                        <> / 평균 {group.avgScore}</>
                      )}
                    </span>
                  </div>
                  <ul className="space-y-1">
                    {group.cells.map((cell) => (
                      <li key={cell.cellId}>
                        <Link
                          to={`/lab/matrix/${cell.cellId}`}
                          className="flex items-center justify-between rounded px-2 py-1 text-xs hover:bg-[--axis-surface-secondary] transition-colors"
                        >
                          <span className="truncate text-[--axis-text-primary]">
                            {cell.industryName} x {cell.functionName}
                          </span>
                          <ScoreBadge score={cell.compositeScore} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            ) : (
              <div className="flex h-24 items-center justify-center">
                <p className="text-sm text-[--axis-text-tertiary]">
                  등록된 Cell 없음
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
