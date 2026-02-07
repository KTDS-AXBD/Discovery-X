/**
 * ShadowRunCard — 개별 Shadow Run 비교 카드
 */

const TRIGGER_LABELS: Record<string, string> = {
  gate_decision: "Gate 결정",
  stage_transition: "단계 전환",
  evidence_evaluation: "근거 평가",
  method_selection: "방법론 선택",
};

const RESULT_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  match: { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-400", label: "일치" },
  partial: { bg: "bg-yellow-100 dark:bg-yellow-900/30", text: "text-yellow-700 dark:text-yellow-400", label: "부분 일치" },
  mismatch: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-400", label: "불일치" },
  pending: { bg: "bg-gray-100 dark:bg-gray-800/30", text: "text-gray-600 dark:text-gray-400", label: "대기" },
};

interface ShadowRunCardProps {
  run: {
    id: string;
    discoveryId: string;
    discoveryTitle: string;
    triggerType: string;
    matchResult: string;
    matchScore: number | null;
    deviationCategory: string | null;
    createdAt: string;
  };
}

export default function ShadowRunCard({ run }: ShadowRunCardProps) {
  const result = RESULT_STYLES[run.matchResult] || RESULT_STYLES.pending;

  return (
    <div className="flex items-center gap-4 rounded-lg border border-[var(--dx-border-subtle,var(--axis-border-default))] px-4 py-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-[var(--axis-text-primary)]">
            {run.discoveryTitle}
          </span>
          <span className="shrink-0 rounded bg-[var(--axis-surface-secondary)] px-1.5 py-0.5 text-xs text-[var(--axis-text-tertiary)]">
            {TRIGGER_LABELS[run.triggerType] || run.triggerType}
          </span>
        </div>
        <div className="mt-0.5 text-xs text-[var(--axis-text-tertiary)]">
          {run.createdAt}
          {run.deviationCategory && (
            <span className="ml-2">
              이탈: {run.deviationCategory}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${result.bg} ${result.text}`}>
          {result.label}
        </span>
        {run.matchScore !== null && (
          <span className="text-sm font-semibold text-[var(--axis-text-primary)] tabular-nums w-8 text-right">
            {run.matchScore}
          </span>
        )}
      </div>
    </div>
  );
}
