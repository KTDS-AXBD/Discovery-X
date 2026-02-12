interface StatisticsSectionProps {
  totalSources: number;
  totalDiscoveries: number;
  activeDiscoveries: number;
  totalProposals: number;
}

const STATS_CONFIG = [
  { key: "sources", label: "소스 수집" },
  { key: "discoveries", label: "발굴 건수" },
  { key: "active", label: "활성 파이프라인" },
  { key: "proposals", label: "사업 제안" },
] as const;

export function StatisticsSection({
  totalSources,
  totalDiscoveries,
  activeDiscoveries,
  totalProposals,
}: StatisticsSectionProps) {
  const values: Record<string, number> = {
    sources: totalSources,
    discoveries: totalDiscoveries,
    active: activeDiscoveries,
    proposals: totalProposals,
  };

  return (
    <div className="dx-panel p-5">
      <h3 className="mb-4 text-base font-bold text-[var(--axis-text-primary)]">
        통계
      </h3>

      <div className="grid grid-cols-4 gap-4">
        {STATS_CONFIG.map((stat) => (
          <div
            key={stat.key}
            className="rounded border border-[var(--axis-border-default)] bg-[var(--axis-surface-secondary)] p-4"
          >
            <p className="text-2xl font-bold text-[var(--axis-text-primary)]">
              {values[stat.key].toLocaleString()}
            </p>
            <p className="mt-1 text-xs text-[var(--axis-text-secondary)]">
              {stat.label}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
