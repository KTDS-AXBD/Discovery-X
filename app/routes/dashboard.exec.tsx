/**
 * /dashboard/exec — Executive Dashboard
 * Framework Matrix 기회 랭킹, 파이프라인 분포, Time Horizon, 주간 변동을 2×2 그리드로 표시.
 */

import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useLoaderData } from "@remix-run/react";
import { getDb } from "~/db";
import {
  getSessionContext,
  getSessionSecret,
} from "~/lib/auth/session.server";
import { ScoringService } from "~/lib/services/scoring.service";
import { MatrixService } from "~/lib/services/matrix.service";
import {
  STAGE_GATE_LABELS,
  type TopCell,
  type ScoreChange,
  type HeatmapData,
} from "~/features/matrix/types";

// ─── Loader 반환 타입 ───
interface ExecDashboardData {
  topCells: TopCell[];
  scoreChanges: ScoreChange[];
  pipelineDist: Array<{ stage: string; label: string; count: number }>;
  horizonDist: Array<{ horizon: string; label: string; count: number }>;
  totalCells: number;
}

const EMPTY: ExecDashboardData = {
  topCells: [],
  scoreChanges: [],
  pipelineDist: [],
  horizonDist: [],
  totalCells: 0,
};

const PIPELINE_STAGES = ["S0", "S1", "S2", "S3", "S4"] as const;

const HORIZON_LABELS: Record<string, string> = {
  short: "단기",
  mid: "중기",
  long: "장기",
};

// ─── Loader ───
export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) return json(EMPTY);

  const teamId = ctx.tenantId;
  const scoring = new ScoringService(db);
  const matrix = new MatrixService(db);

  let topCells: TopCell[] = [];
  let scoreChanges: ScoreChange[] = [];
  let heatmap: HeatmapData | null = null;

  try {
    [topCells, scoreChanges, heatmap] = await Promise.all([
      scoring.getTopCells(teamId, 10),
      scoring.getScoreChanges(
        teamId,
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      ),
      matrix.getHeatmapData(teamId),
    ]);
  } catch (err: unknown) {
    console.error(
      "[dashboard.exec] loader error:",
      err instanceof Error ? err.message : err,
    );
    return json(EMPTY);
  }

  // 파이프라인 분포 집계
  const stageCounts = new Map<string, number>();
  for (const stage of PIPELINE_STAGES) {
    stageCounts.set(stage, 0);
  }
  if (heatmap) {
    for (const cell of heatmap.cells) {
      const stage = cell.pipelineStage ?? "S0";
      stageCounts.set(stage, (stageCounts.get(stage) ?? 0) + 1);
    }
  }
  const pipelineDist = PIPELINE_STAGES.map((stage) => ({
    stage,
    label: STAGE_GATE_LABELS[stage] ?? stage,
    count: stageCounts.get(stage) ?? 0,
  }));

  // timeHorizon은 HeatmapCell에 포함되지 않으므로 MatrixService.getCells로 별도 조회
  let horizonDist: Array<{ horizon: string; label: string; count: number }> =
    [];
  try {
    const allCells = await matrix.getCells(teamId);
    const hCounts = new Map<string, number>();
    for (const cell of allCells) {
      const h = cell.timeHorizon ?? "short";
      hCounts.set(h, (hCounts.get(h) ?? 0) + 1);
    }
    horizonDist = ["short", "mid", "long"].map((h) => ({
      horizon: h,
      label: HORIZON_LABELS[h] ?? h,
      count: hCounts.get(h) ?? 0,
    }));
  } catch {
    // matrix_cells 테이블 없을 수 있음
  }

  const totalCells = heatmap?.cells.length ?? 0;

  return json({
    topCells,
    scoreChanges,
    pipelineDist,
    horizonDist,
    totalCells,
  });
}

// ─── Component ───
export default function ExecDashboard() {
  const { topCells, scoreChanges, pipelineDist, horizonDist, totalCells } =
    useLoaderData<typeof loader>();

  const maxPipelineCount = Math.max(...pipelineDist.map((d) => d.count), 1);

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-baseline justify-between">
        <h1 className="text-lg font-semibold text-[--axis-text-primary]">
          Executive Dashboard
        </h1>
        <span className="text-xs text-[--axis-text-tertiary]">
          전체 {totalCells}개 셀
        </span>
      </div>

      {/* 2×2 그리드 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* 패널 1: Top 10 기회 */}
        <Panel title="Top 10 기회 (Composite)">
          {topCells.length === 0 ? (
            <EmptyState text="스코어링된 셀이 없습니다" />
          ) : (
            <ol className="space-y-1.5">
              {topCells.map((cell, idx) => (
                <li
                  key={cell.cellId}
                  className="flex items-center gap-2 text-sm"
                >
                  <span className="w-5 shrink-0 text-right font-mono text-xs text-[--axis-text-tertiary]">
                    {idx + 1}.
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[--axis-text-primary]">
                    {cell.industryName}×{cell.functionName}
                  </span>
                  <StageBadge stage={cell.pipelineStage} />
                  <span className="shrink-0 font-mono text-sm font-medium text-[--axis-text-primary]">
                    {cell.compositeScore.toFixed(1)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Panel>

        {/* 패널 2: 파이프라인 분포 */}
        <Panel title="파이프라인 분포">
          <div className="space-y-2">
            {pipelineDist.map((d) => (
              <div key={d.stage} className="flex items-center gap-2 text-sm">
                <span className="w-20 shrink-0 text-[--axis-text-secondary]">
                  {d.stage}: {d.label}
                </span>
                <div className="relative h-5 flex-1 overflow-hidden rounded bg-[--axis-surface-secondary]">
                  <div
                    className="absolute inset-y-0 left-0 rounded bg-[--axis-brand-primary]"
                    style={{
                      width: `${(d.count / maxPipelineCount) * 100}%`,
                      minWidth: d.count > 0 ? "4px" : "0",
                    }}
                  />
                </div>
                <span className="w-6 shrink-0 text-right font-mono text-xs text-[--axis-text-tertiary]">
                  {d.count}
                </span>
              </div>
            ))}
          </div>
        </Panel>

        {/* 패널 3: Time Horizon 분포 */}
        <Panel title="Time Horizon 분포">
          {horizonDist.length === 0 ||
          horizonDist.every((d) => d.count === 0) ? (
            <EmptyState text="등록된 셀이 없습니다" />
          ) : (
            <HorizonChart data={horizonDist} />
          )}
        </Panel>

        {/* 패널 4: 주간 스코어 변동 */}
        <Panel title="주간 스코어 변동">
          {scoreChanges.length === 0 ? (
            <EmptyState text="최근 7일간 변동 없음" />
          ) : (
            <ul className="space-y-1.5">
              {scoreChanges.slice(0, 10).map((ch) => (
                <li
                  key={ch.cellId}
                  className="flex items-center gap-2 text-sm"
                >
                  <DeltaArrow delta={ch.delta} />
                  <span className="min-w-0 flex-1 truncate text-[--axis-text-primary]">
                    {ch.industryName}×{ch.functionName}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-[--axis-text-tertiary]">
                    {ch.delta >= 0 ? "+" : ""}
                    {ch.delta.toFixed(1)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

// ─── Sub-components ───

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-[--axis-border-primary] bg-[--axis-surface-primary] p-4">
      <h2 className="mb-3 text-sm font-medium text-[--axis-text-secondary]">
        {title}
      </h2>
      {children}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <p className="py-6 text-center text-sm text-[--axis-text-tertiary]">
      {text}
    </p>
  );
}

function StageBadge({ stage }: { stage: string }) {
  return (
    <span className="shrink-0 rounded-full bg-[--axis-surface-secondary] px-1.5 py-0.5 text-[10px] font-medium text-[--axis-text-tertiary]">
      {stage}
    </span>
  );
}

function DeltaArrow({ delta }: { delta: number }) {
  if (delta > 0) {
    return <span className="shrink-0 text-sm text-green-500">↑</span>;
  }
  if (delta < 0) {
    return <span className="shrink-0 text-sm text-red-500">↓</span>;
  }
  return <span className="shrink-0 text-sm text-[--axis-text-tertiary]">─</span>;
}

function HorizonChart({
  data,
}: {
  data: Array<{ horizon: string; label: string; count: number }>;
}) {
  const total = data.reduce((s, d) => s + d.count, 0) || 1;

  return (
    <div className="space-y-3">
      {/* 비율 바 */}
      <div className="flex h-6 overflow-hidden rounded">
        {data.map((d) => {
          const pct = (d.count / total) * 100;
          if (pct === 0) return null;
          return (
            <div
              key={d.horizon}
              className={`flex items-center justify-center text-[10px] font-medium text-white ${
                d.horizon === "short"
                  ? "bg-blue-500"
                  : d.horizon === "mid"
                    ? "bg-amber-500"
                    : "bg-purple-500"
              }`}
              style={{ width: `${pct}%`, minWidth: "24px" }}
            >
              {Math.round(pct)}%
            </div>
          );
        })}
      </div>

      {/* 범례 */}
      <div className="flex gap-4 text-xs text-[--axis-text-secondary]">
        {data.map((d) => (
          <div key={d.horizon} className="flex items-center gap-1.5">
            <span
              className={`inline-block h-2.5 w-2.5 rounded-full ${
                d.horizon === "short"
                  ? "bg-blue-500"
                  : d.horizon === "mid"
                    ? "bg-amber-500"
                    : "bg-purple-500"
              }`}
            />
            {d.label}: {d.count}건 ({Math.round((d.count / total) * 100)}%)
          </div>
        ))}
      </div>
    </div>
  );
}
