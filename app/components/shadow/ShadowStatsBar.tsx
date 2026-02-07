/**
 * ShadowStatsBar — Shadow Mode 통계 요약 바
 */

interface ShadowStatsBarProps {
  totalRuns: number;
  matchRate: number;
  mismatchCount: number;
  deviationTypes: number;
}

export default function ShadowStatsBar({
  totalRuns,
  matchRate,
  mismatchCount,
  deviationTypes,
}: ShadowStatsBarProps) {
  const stats = [
    { label: "전체 실행", value: totalRuns, unit: "건" },
    { label: "평균 일치율", value: matchRate, unit: "%" },
    { label: "불일치", value: mismatchCount, unit: "건" },
    { label: "이탈 유형", value: deviationTypes, unit: "개" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="rounded-lg border border-[var(--dx-border-subtle,var(--axis-border-default))] bg-[var(--axis-surface-primary)] p-4"
        >
          <div className="text-2xl font-bold tabular-nums text-[var(--axis-text-primary)]">
            {stat.value}
            <span className="ml-0.5 text-sm font-normal text-[var(--axis-text-tertiary)]">
              {stat.unit}
            </span>
          </div>
          <div className="mt-1 text-xs text-[var(--axis-text-tertiary)]">{stat.label}</div>
        </div>
      ))}
    </div>
  );
}
