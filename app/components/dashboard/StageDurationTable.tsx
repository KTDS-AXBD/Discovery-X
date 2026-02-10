interface StageDurationTableProps {
  data: { stage: string; label: string; count: number }[];
}

export function StageDurationTable({ data }: StageDurationTableProps) {
  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-[var(--axis-text-tertiary)]">데이터 없음</p>
    );
  }

  const total = data.reduce((sum, d) => sum + d.count, 0);
  const maxCount = Math.max(...data.map((d) => d.count), 1);

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-[var(--axis-border-default)]">
          <th className="pb-2 text-left text-xs font-medium text-[var(--axis-text-tertiary)]">
            단계
          </th>
          <th className="pb-2 text-right text-xs font-medium text-[var(--axis-text-tertiary)] w-16">
            건수
          </th>
          <th className="pb-2 pl-4 text-left text-xs font-medium text-[var(--axis-text-tertiary)]">
            비율
          </th>
        </tr>
      </thead>
      <tbody>
        {data.map((row) => {
          const barPct = (row.count / maxCount) * 100;
          const pct = total > 0 ? ((row.count / total) * 100).toFixed(0) : "0";
          return (
            <tr
              key={row.stage}
              className="border-b border-[var(--axis-border-default)] last:border-b-0"
            >
              <td className="py-2 text-[var(--axis-text-primary)]">{row.label}</td>
              <td className="py-2 text-right tabular-nums text-[var(--axis-text-secondary)]">
                {row.count}건
              </td>
              <td className="py-2 pl-4">
                <div className="flex items-center gap-2">
                  <div className="h-3 flex-1 rounded-full bg-[var(--axis-surface-secondary)]">
                    <div
                      className="h-3 rounded-full transition-all duration-300"
                      style={{
                        width: `${barPct}%`,
                        backgroundColor: "var(--axis-chart-bar)",
                        minWidth: barPct > 0 ? "4px" : "0",
                      }}
                    />
                  </div>
                  <span className="w-8 text-right text-xs tabular-nums text-[var(--axis-text-tertiary)]">
                    {pct}%
                  </span>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
