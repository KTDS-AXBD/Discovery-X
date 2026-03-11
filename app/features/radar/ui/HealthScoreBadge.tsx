interface HealthScoreBadgeProps {
  score: number | null;
  totalItems?: number;
  size?: "sm" | "md";
}

const HEALTH_COLORS = {
  good: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  warn: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  bad: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  none: "bg-fg-tertiary/10 text-fg-tertiary",
} as const;

function getHealthColor(score: number | null): keyof typeof HEALTH_COLORS {
  if (score === null) return "none";
  if (score >= 0.5) return "good";
  if (score >= 0.3) return "warn";
  return "bad";
}

export function HealthScoreBadge({ score, totalItems, size = "md" }: HealthScoreBadgeProps) {
  const color = getHealthColor(score);
  const sizeClass = size === "sm" ? "text-xs px-1.5 py-0.5" : "text-sm px-2 py-1";

  if (score === null) {
    return (
      <span className={`inline-flex items-center rounded-md font-medium ${HEALTH_COLORS.none} ${sizeClass}`}>
        {totalItems !== undefined ? `수집 중 (${totalItems}/20)` : "-"}
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center rounded-md font-mono font-semibold ${HEALTH_COLORS[color]} ${sizeClass}`}>
      {score.toFixed(2)}
    </span>
  );
}
