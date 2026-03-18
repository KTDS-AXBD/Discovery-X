import type { DimensionScore } from "../types";

interface DimensionCardProps {
  dimension: DimensionScore;
}

const LABELS: Record<string, string> = {
  goal: "목표",
  constraint: "제약",
  success: "성공기준",
  context: "맥락",
};

export function DimensionCard({ dimension }: DimensionCardProps) {
  const { dimension: type, score } = dimension;
  const label = LABELS[type] ?? type;

  // Greenfield에서 Context는 가중치 0 → N/A 표시
  if (type === "context" && score === 0 && dimension.rationale.includes("미적용")) {
    return (
      <div className="rounded border border-neutral-100 bg-neutral-50 p-2 text-center dark:border-zinc-800 dark:bg-zinc-900">
        <div className="text-xs text-neutral-400 dark:text-zinc-600">{label}</div>
        <div className="text-sm text-neutral-300 dark:text-zinc-700">&mdash;</div>
      </div>
    );
  }

  const statusColor = score >= 0.8 ? "text-green-600 dark:text-green-400"
    : score >= 0.6 ? "text-yellow-600 dark:text-yellow-400"
    : "text-red-600 dark:text-red-400";

  const borderColor = score >= 0.8 ? "border-green-200 dark:border-green-800"
    : score >= 0.6 ? "border-yellow-200 dark:border-yellow-800"
    : "border-red-200 dark:border-red-800";

  const dotColor = score >= 0.8 ? "bg-green-500"
    : score >= 0.6 ? "bg-yellow-500"
    : "bg-red-500";

  return (
    <div
      className={`rounded border ${borderColor} bg-white p-2 text-center
                   hover:shadow-sm transition-all cursor-default dark:bg-zinc-900`}
      title={dimension.rationale ?? undefined}
    >
      <div className="text-xs text-neutral-500 dark:text-zinc-400">{label}</div>
      <div className={`text-sm font-semibold ${statusColor} flex items-center justify-center gap-1`}>
        {score.toFixed(1)}
        <span className={`inline-block w-2 h-2 rounded-full ${dotColor}`} />
      </div>
      {dimension.weakPoints.length > 0 && (
        <div className="mt-1 text-[10px] text-neutral-400 dark:text-zinc-500 truncate">
          {dimension.weakPoints[0]}
        </div>
      )}
      {dimension.suggestedQuestions.length > 0 && (
        <div
          className="mt-0.5 text-[10px] text-blue-500 dark:text-blue-400 truncate"
          title={dimension.suggestedQuestions.join(" / ")}
        >
          Q: {dimension.suggestedQuestions[0]}
        </div>
      )}
    </div>
  );
}
