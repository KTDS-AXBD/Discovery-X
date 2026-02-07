/**
 * ScoreDimension — 차원별 스코어 바
 */

const DIMENSION_LABELS: Record<string, string> = {
  ai_readiness: "AI Readiness",
  market_position: "Market Position",
  tech_maturity: "Tech Maturity",
  culture_fit: "Culture Fit",
  financial_health: "Financial Health",
  regulatory_compliance: "Reg. Compliance",
};

interface ScoreDimensionProps {
  dimension: string;
  score: number;
  evidenceSummary: string | null;
}

export default function ScoreDimension({ dimension, score, evidenceSummary }: ScoreDimensionProps) {
  const color =
    score >= 80
      ? "bg-green-500"
      : score >= 60
        ? "bg-blue-500"
        : score >= 40
          ? "bg-yellow-500"
          : "bg-red-500";

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-[var(--axis-text-secondary)]">
          {DIMENSION_LABELS[dimension] || dimension}
        </span>
        <span className="text-sm font-bold tabular-nums text-[var(--axis-text-primary)]">
          {score}
        </span>
      </div>
      <div className="h-3 rounded-full bg-[var(--axis-surface-secondary)] overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all`}
          style={{ width: `${score}%` }}
        />
      </div>
      {evidenceSummary && (
        <p className="mt-0.5 text-xs text-[var(--axis-text-tertiary)] truncate">
          {evidenceSummary}
        </p>
      )}
    </div>
  );
}
