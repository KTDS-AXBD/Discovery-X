interface CollectionStatusPanelProps {
  totalExplored: number;
  totalCollected: number;
  sources: { label: string; count: number; color: string }[];
}

export function CollectionStatusPanel({
  totalExplored,
  totalCollected,
  sources,
}: CollectionStatusPanelProps) {
  const total = sources.reduce((sum, s) => sum + s.count, 0) || 1;

  return (
    <div className="p-4">
      <h3 className="mb-4 text-sm font-semibold text-[var(--axis-text-primary)]">
        수집 현황
      </h3>

      {/* Donut chart placeholder */}
      <div className="mb-4 flex items-center justify-center">
        <div className="relative flex h-28 w-28 items-center justify-center rounded-full border-8 border-[var(--axis-surface-secondary)]">
          <div className="text-center">
            <p className="text-lg font-bold text-[var(--axis-text-primary)]">{totalCollected}</p>
            <p className="text-[10px] text-[var(--axis-text-tertiary)]">수집</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-[var(--axis-surface-secondary)] p-3 text-center">
          <p className="text-lg font-bold text-[var(--axis-text-primary)]">{totalExplored}</p>
          <p className="text-[10px] text-[var(--axis-text-tertiary)]">전체 탐색</p>
        </div>
        <div className="rounded-lg bg-[var(--axis-surface-secondary)] p-3 text-center">
          <p className="text-lg font-bold text-[var(--axis-text-primary)]">{totalCollected}</p>
          <p className="text-[10px] text-[var(--axis-text-tertiary)]">수집</p>
        </div>
      </div>

      {/* Source breakdown */}
      <h4 className="mb-2 text-xs font-semibold text-[var(--axis-text-tertiary)]">수집 소스</h4>
      <div className="space-y-2">
        {sources.map((source) => (
          <div key={source.label} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: source.color }}
              />
              <span className="text-xs text-[var(--axis-text-secondary)]">{source.label}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-[var(--axis-text-primary)]">{source.count}</span>
              <span className="text-[10px] text-[var(--axis-text-tertiary)]">
                {Math.round((source.count / total) * 100)}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
