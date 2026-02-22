interface EvidenceChartProps {
  distribution: Record<string, number>;
  total: number;
}

const STRENGTH_COLORS: Record<string, { bg: string; label: string }> = {
  A: { bg: "bg-green-500", label: "A (Hard data)" },
  B: { bg: "bg-blue-500", label: "B (Direct)" },
  C: { bg: "bg-yellow-500", label: "C (Indirect)" },
  D: { bg: "bg-red-400", label: "D (Intuition)" },
};

export function EvidenceChart({ distribution, total }: EvidenceChartProps) {
  if (total === 0) return null;

  return (
    <div className="mb-2">
      {/* Stack bar */}
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-secondary">
        {(["A", "B", "C", "D"] as const).map((strength) => {
          const count = distribution[strength] || 0;
          if (count === 0) return null;
          const pct = (count / total) * 100;
          const color = STRENGTH_COLORS[strength];
          return (
            <div
              key={strength}
              className={`${color.bg} transition-all`}
              style={{ width: `${pct}%` }}
              title={`${color.label}: ${count}건 (${Math.round(pct)}%)`}
            />
          );
        })}
      </div>
      {/* Legend */}
      <div className="mt-1 flex gap-3 text-[10px] text-fg-tertiary">
        {(["A", "B", "C", "D"] as const).map((strength) => {
          const count = distribution[strength] || 0;
          if (count === 0) return null;
          const color = STRENGTH_COLORS[strength];
          return (
            <span key={strength} className="flex items-center gap-1">
              <span className={`inline-block h-2 w-2 rounded-full ${color.bg}`} />
              {strength}: {count}
            </span>
          );
        })}
      </div>
    </div>
  );
}
