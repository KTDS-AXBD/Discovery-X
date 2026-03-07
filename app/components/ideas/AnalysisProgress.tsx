/**
 * Analysis progress indicator — shows 12 category states in 3 phases.
 * States: pending (gray), running (blue pulse), complete (green), failed (red)
 */

import { ANALYSIS_CATEGORIES } from "~/lib/ideas/analysis-prompts";
import { Progress } from "~/components/ui/Progress";

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

const PHASE_LABELS: Record<number, string> = {
  1: "기초 조사",
  2: "전략 분석",
  3: "비즈니스 모델",
};

export function AnalysisProgress({ categoryStates, isRunning }: AnalysisProgressProps) {
  const completedCount = Object.values(categoryStates).filter((s) => s === "complete").length;
  const failedCount = Object.values(categoryStates).filter((s) => s === "failed").length;
  const totalCount = Object.keys(categoryStates).length || ANALYSIS_CATEGORIES.length;

  // Group categories by phase
  const phases = [1, 2, 3] as const;
  const categoriesByPhase = phases.map((phase) =>
    ANALYSIS_CATEGORIES.filter((c) => c.phase === phase)
  );

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

      <Progress value={((completedCount + failedCount) / totalCount) * 100} size="sm" className="mb-2" />

      {/* Category chips grouped by phase */}
      <div className="space-y-1.5">
        {phases.map((phase, pi) => {
          const cats = categoriesByPhase[pi];
          const hasActiveCategory = cats.some((c) => categoryStates[c.category]);
          if (!hasActiveCategory && Object.keys(categoryStates).length > 0) return null;

          return (
            <div key={phase}>
              <span className="mb-0.5 block text-[9px] font-medium uppercase tracking-wider text-fg-tertiary">
                {PHASE_LABELS[phase]}
              </span>
              <div className="flex flex-wrap gap-1">
                {cats.map((cat) => {
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
        })}
      </div>
    </div>
  );
}
