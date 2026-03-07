import { cn } from "~/lib/utils/cn";
import type { HeatmapData, HeatmapCell } from "~/features/matrix/types";
import { getScoreLevel, getScoreColor, STAGE_GATE_MAP } from "~/features/matrix/types";

interface HeatmapGridProps {
  data: HeatmapData;
  onCellClick: (cellId: string) => void;
}

// ─── category 구분선용 그룹핑 ───
function groupFunctionsByCategory(
  fns: HeatmapData["functions"],
): Array<{ category: string; items: HeatmapData["functions"] }> {
  const groups: Array<{ category: string; items: HeatmapData["functions"] }> = [];
  let current: (typeof groups)[number] | null = null;
  for (const fn of fns) {
    if (!current || current.category !== fn.category) {
      current = { category: fn.category, items: [] };
      groups.push(current);
    }
    current.items.push(fn);
  }
  return groups;
}

const CATEGORY_LABELS: Record<string, string> = {
  sap_based: "SAP 기반",
  ai_service: "AI 서비스",
  hybrid: "혼합",
};

// ─── 개별 셀 컴포넌트 ───
function HeatmapCellBox({
  cell,
  onClick,
}: {
  cell: HeatmapCell | null;
  onClick: () => void;
}) {
  if (!cell || cell.cellId === null) {
    // 빈 셀 (Cell 미생성)
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex h-16 w-full items-center justify-center rounded border border-dashed border-line-subtle bg-surface-tertiary text-[10px] text-fg-tertiary opacity-50 transition-opacity hover:opacity-80 font-mono-dx"
        title="셀 미생성"
      >
        —
      </button>
    );
  }

  const level = getScoreLevel(cell.compositeScore);
  const color = getScoreColor(level);
  const gate = (STAGE_GATE_MAP as Record<string, string>)[cell.pipelineStage ?? "activity"] ?? "S0";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex h-16 w-full flex-col items-center justify-center rounded border transition-all",
        "border-line-subtle",
        "hover:border-lab-accent hover:ring-1 hover:ring-lab-accent",
        cell.cellStatus === "archived" && "opacity-40",
        cell.cellStatus === "paused" && "opacity-60",
      )}
      style={{
        backgroundColor: level === "none" ? "var(--axis-bg-tertiary,#1e293b)" : `${color}18`,
        fontFamily: "var(--dx-font-mono)",
      }}
      title={`${cell.industryName} × ${cell.functionName} (${gate})`}
    >
      {/* 스코어 */}
      <span
        className="text-sm font-bold leading-none"
        style={{ color: level === "none" ? "var(--axis-text-tertiary,#64748b)" : color }}
      >
        {cell.compositeScore !== null ? cell.compositeScore.toFixed(1) : "—"}
      </span>

      {/* Stage 배지 */}
      <span className="mt-1 text-[9px] font-medium uppercase tracking-wider text-fg-tertiary">
        {gate}
      </span>

      {/* Delta 표시 */}
      {cell.delta !== null && cell.delta !== 0 && (
        <span
          className="absolute right-1 top-1 text-[8px] font-bold"
          style={{
            color: cell.delta > 0 ? "var(--dx-score-high)" : "var(--dx-score-low)",
          }}
        >
          {cell.delta > 0 ? "▲" : "▼"}
        </span>
      )}
    </button>
  );
}

// ─── 메인 그리드 ───
export function HeatmapGrid({ data, onCellClick }: HeatmapGridProps) {
  const { industries, functions: fns, cells } = data;

  // 셀 조회 맵 (industryId_functionId → HeatmapCell)
  const cellMap = new Map<string, HeatmapCell>();
  for (const cell of cells) {
    const key = `${cell.industryId}_${cell.functionId}`;
    cellMap.set(key, cell);
  }

  const fnGroups = groupFunctionsByCategory(fns);

  return (
    <div className="overflow-x-auto rounded-lg border border-line-subtle bg-surface-secondary">
      <table className="w-full border-collapse font-mono-dx">
        {/* ─── 헤더: 산업 (X축) ─── */}
        <thead>
          <tr>
            <th className="sticky left-0 z-10 w-36 bg-surface-secondary px-3 py-2 text-left text-[10px] font-normal uppercase tracking-wider text-fg-tertiary">
              기능 ＼ 산업
            </th>
            {industries.map((ind) => (
              <th
                key={ind.id}
                className="px-1 py-2 text-center text-[10px] font-medium uppercase tracking-wider text-lab-accent"
                style={{ minWidth: 80 }}
              >
                <span className="block max-w-[80px] truncate" title={ind.name}>
                  {ind.name}
                </span>
                {ind.nameEn && (
                  <span className="block text-[8px] font-normal text-fg-tertiary">
                    {ind.nameEn}
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>

        {/* ─── 본문: 기능 (Y축) × 산업 그리드 ─── */}
        <tbody>
          {fnGroups.map((group) => (
            <>
              {/* 카테고리 구분 행 */}
              <tr key={`cat-${group.category}`}>
                <td
                  colSpan={industries.length + 1}
                  className="border-t border-line-subtle bg-surface-tertiary px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest text-lab-accent"
                >
                  {CATEGORY_LABELS[group.category] ?? group.category}
                </td>
              </tr>
              {group.items.map((fn) => (
                <tr key={fn.id} className="border-t border-line-subtle">
                  {/* 기능명 */}
                  <td className="sticky left-0 z-10 bg-surface-secondary px-3 py-1 text-xs text-fg-secondary">
                    <span className="block max-w-[130px] truncate" title={fn.name}>
                      {fn.name}
                    </span>
                  </td>
                  {/* 산업별 셀 */}
                  {industries.map((ind) => {
                    const key = `${ind.id}_${fn.id}`;
                    const cell = cellMap.get(key) ?? null;
                    return (
                      <td key={key} className="p-0.5">
                        <HeatmapCellBox
                          cell={cell}
                          onClick={() => {
                            if (cell?.cellId) {
                              onCellClick(cell.cellId);
                            }
                          }}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
}
