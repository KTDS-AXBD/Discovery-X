interface Experiment {
  id: string;
  hypothesis: string;
  completedAt?: Date | number | string | null;
  createdAt: Date | number | string | null;
  deadline: Date | number | string | null;
}

interface ExperimentGanttProps {
  experiments: Experiment[];
  now: number;
}

function getStatus(exp: Experiment): "COMPLETED" | "ACTIVE" {
  return exp.completedAt ? "COMPLETED" : "ACTIVE";
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "var(--axis-chart-bar,#3b82f6)",
  COMPLETED: "var(--axis-text-success,#22c55e)",
};

export function ExperimentGantt({ experiments, now }: ExperimentGanttProps) {
  if (experiments.length === 0) return null;

  const timestamps = experiments.flatMap((e) => [
    e.createdAt ? new Date(e.createdAt).getTime() : null,
    e.deadline ? new Date(e.deadline).getTime() : null,
  ]).filter((t): t is number => t !== null && !isNaN(t));

  if (timestamps.length < 2) return null;

  const minTime = Math.min(...timestamps);
  const maxTime = Math.max(...timestamps);
  const range = maxTime - minTime || 1;

  const barHeight = 24;
  const gap = 8;
  const labelWidth = 120;
  const chartWidth = 400;
  const svgHeight = experiments.length * (barHeight + gap) + gap;

  const toX = (time: number) => labelWidth + ((time - minTime) / range) * chartWidth;

  return (
    <svg
      viewBox={`0 0 ${labelWidth + chartWidth + 40} ${svgHeight}`}
      width="100%"
      height={svgHeight}
      className="overflow-visible"
    >
      {experiments.map((exp, i) => {
        const y = i * (barHeight + gap) + gap;
        const startX = exp.createdAt ? toX(new Date(exp.createdAt).getTime()) : labelWidth;
        const endX = exp.deadline ? toX(new Date(exp.deadline).getTime()) : labelWidth + chartWidth;
        const barWidth = Math.max(endX - startX, 4);
        const status = getStatus(exp);
        const color = STATUS_COLORS[status];

        return (
          <g key={exp.id}>
            <text
              x={labelWidth - 8}
              y={y + barHeight / 2 + 4}
              textAnchor="end"
              style={{ fill: "var(--axis-text-tertiary,#6b7280)" }}
              fontSize="11"
            >
              {(exp.hypothesis || "실험").slice(0, 12)}
            </text>
            <rect
              x={startX}
              y={y}
              width={barWidth}
              height={barHeight}
              rx="4"
              style={{ fill: color, opacity: 0.8 }}
            />
            {status === "ACTIVE" && (
              <line
                x1={toX(now)}
                y1={y - 2}
                x2={toX(now)}
                y2={y + barHeight + 2}
                stroke="var(--axis-text-brand,#6366f1)"
                strokeWidth="2"
                strokeDasharray="4 2"
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}
