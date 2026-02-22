/**
 * Analysis progress indicator — shows 6 category states during direct analysis.
 * States: pending (gray), running (blue pulse), complete (green), failed (red)
 */

import { ANALYSIS_CATEGORIES } from "~/lib/ideas/analysis-prompts";

export type CategoryState = "pending" | "running" | "complete" | "failed";

interface AnalysisProgressProps {
  categoryStates: Record<string, CategoryState>;
  isRunning: boolean;
}

const STATE_STYLES: Record<CategoryState, string> = {
  pending: "bg-surface-secondary text-fg-tertiary",
  running: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 animate-pulse",
  complete: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  failed: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

const STATE_ICONS: Record<CategoryState, string> = {
  pending: "\u2022",  // bullet
  running: "\u27F3",  // rotating arrows
  complete: "\u2713", // checkmark
  failed: "\u2717",   // cross
};

export function AnalysisProgress({ categoryStates, isRunning }: AnalysisProgressProps) {
  const completedCount = Object.values(categoryStates).filter((s) => s === "complete").length;
  const failedCount = Object.values(categoryStates).filter((s) => s === "failed").length;
  const totalCount = ANALYSIS_CATEGORIES.length;

  return (
    <div className="border-b border-line px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-fg-secondary">
          {isRunning ? "분석 진행 중..." : "분석 완료"}
        </span>
        <span className="text-[10px] text-fg-tertiary">
          {completedCount}/{totalCount}
          {failedCount > 0 && ` (${failedCount} 실패)`}
        </span>
      </div>

      {/* Progress bar */}
      <div className="mb-2 h-1 overflow-hidden rounded-full bg-surface-secondary">
        <div
          className="h-full rounded-full bg-fg-brand transition-all duration-500"
          style={{ width: `${((completedCount + failedCount) / totalCount) * 100}%` }}
        />
      </div>

      {/* Category chips */}
      <div className="flex flex-wrap gap-1">
        {ANALYSIS_CATEGORIES.map((cat) => {
          const state = categoryStates[cat.category] || "pending";
          return (
            <span
              key={cat.category}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${STATE_STYLES[state]}`}
            >
              <span className="text-[10px]">{STATE_ICONS[state]}</span>
              {cat.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}
