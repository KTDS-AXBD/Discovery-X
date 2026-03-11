import type { HealthSummary } from "~/features/radar/service/health-metrics";

interface HealthSummaryCardsProps {
  summary: HealthSummary;
}

const CARDS = [
  { key: "totalSources" as const, label: "전체 채널", color: "text-fg" },
  { key: "healthySources" as const, label: "건강한 채널", color: "text-emerald-600 dark:text-emerald-400", sub: "≥ 0.5" },
  { key: "reviewSources" as const, label: "주의 필요", color: "text-amber-600 dark:text-amber-400", sub: "< 0.5" },
  { key: "failedSources" as const, label: "실패", color: "text-red-600 dark:text-red-400" },
];

export function HealthSummaryCards({ summary }: HealthSummaryCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {CARDS.map(({ key, label, color, sub }) => (
        <div
          key={key}
          className="rounded-lg border border-border bg-bg-secondary p-4"
        >
          <p className="text-xs text-fg-tertiary">{label}</p>
          <p className={`mt-1 text-2xl font-bold ${color}`}>{summary[key]}</p>
          {sub && <p className="mt-0.5 text-[10px] text-fg-tertiary">{sub}</p>}
        </div>
      ))}
    </div>
  );
}
