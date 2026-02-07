/**
 * ChecklistProgress — 체크리스트 진행 바
 */

const TYPE_LABELS: Record<string, string> = {
  due_diligence: "Due Diligence",
  pmi: "PMI",
  regulatory: "규제 준수",
  technical: "기술 감사",
};

interface ChecklistItem {
  label: string;
  checked: boolean;
  note?: string;
  priority?: string;
}

interface ChecklistProgressProps {
  checklist: {
    id: string;
    checklistType: string;
    items: ChecklistItem[];
    progress: number;
  };
}

export default function ChecklistProgress({ checklist }: ChecklistProgressProps) {
  const items = checklist.items || [];
  const checkedCount = items.filter((i) => i.checked).length;
  const pct = items.length > 0 ? Math.round((checkedCount / items.length) * 100) : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold text-[var(--axis-text-primary)]">
          {TYPE_LABELS[checklist.checklistType] || checklist.checklistType}
        </h4>
        <span className="text-xs text-[var(--axis-text-tertiary)]">
          {checkedCount}/{items.length} ({pct}%)
        </span>
      </div>

      {/* 진행 바 */}
      <div className="h-2 rounded-full bg-[var(--axis-surface-secondary)] overflow-hidden mb-3">
        <div
          className="h-full rounded-full bg-[var(--axis-text-brand)] transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* 항목 목록 */}
      <div className="space-y-1">
        {items.map((item, i) => (
          <div key={i} className="flex items-start gap-2 text-sm">
            <span className={`mt-0.5 shrink-0 ${item.checked ? "text-green-500" : "text-[var(--axis-text-tertiary)]"}`}>
              {item.checked ? "✓" : "○"}
            </span>
            <span
              className={`flex-1 ${
                item.checked
                  ? "text-[var(--axis-text-tertiary)] line-through"
                  : "text-[var(--axis-text-secondary)]"
              }`}
            >
              {item.label}
            </span>
            {item.priority && (
              <span
                className={`shrink-0 rounded px-1 py-0.5 text-xs ${
                  item.priority === "high"
                    ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                    : item.priority === "medium"
                      ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                      : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                }`}
              >
                {item.priority}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
