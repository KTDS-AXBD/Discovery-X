interface WeeklyBarProps {
  data: { week: string; count: number }[];
}

export function WeeklyBar({ data }: WeeklyBarProps) {
  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-fg-tertiary">데이터 없음</p>;
  }

  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const barHeight = 28;
  const gap = 8;
  const labelWidth = 80;
  const chartWidth = 400;
  const svgHeight = data.length * (barHeight + gap) + gap;

  return (
    <svg
      viewBox={`0 0 ${labelWidth + chartWidth + 40} ${svgHeight}`}
      width="100%"
      height={svgHeight}
      className="overflow-visible"
    >
      {data.map((d, i) => {
        const y = i * (barHeight + gap) + gap;
        const barWidth = (d.count / maxCount) * chartWidth;
        return (
          <g key={d.week}>
            <text
              x={labelWidth - 8}
              y={y + barHeight / 2 + 4}
              textAnchor="end"
              style={{ fill: "var(--axis-text-tertiary)" }}
              fontSize="12"
            >
              {d.week}
            </text>
            <rect
              x={labelWidth}
              y={y}
              width={Math.max(barWidth, 2)}
              height={barHeight}
              rx="4"
              style={{ fill: "var(--axis-chart-bar)" }}
            />
            {d.count > 0 && (
              <text
                x={labelWidth + barWidth + 8}
                y={y + barHeight / 2 + 4}
                style={{ fill: "var(--axis-text-secondary)" }}
                fontSize="12"
                fontWeight="600"
              >
                {d.count}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
