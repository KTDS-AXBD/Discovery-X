interface DailyActivityChartProps {
  data: { date: string; count: number }[];
}

export function DailyActivityChart({ data }: DailyActivityChartProps) {
  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-[var(--axis-text-tertiary)]">데이터 없음</p>
    );
  }

  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const barWidth = 24;
  const barGap = 12;
  const chartHeight = 160;
  const labelHeight = 28;
  const topPadding = 20;
  const leftPadding = 36;
  const svgWidth = leftPadding + data.length * (barWidth + barGap) + barGap;
  const svgHeight = topPadding + chartHeight + labelHeight;

  const gridLines = 4;
  const gridStep = maxCount / gridLines;

  const formatDate = (dateStr: string) => {
    const parts = dateStr.split("-");
    if (parts.length >= 3) return `${parts[1]}.${parts[2]}`;
    return dateStr;
  };

  return (
    <svg
      viewBox={`0 0 ${svgWidth} ${svgHeight}`}
      width="100%"
      height={svgHeight}
      className="overflow-visible"
    >
      {/* Y축 그리드 라인 */}
      {Array.from({ length: gridLines + 1 }, (_, i) => {
        const value = Math.round(gridStep * i);
        const y = topPadding + chartHeight - (value / maxCount) * chartHeight;
        return (
          <g key={`grid-${i}`}>
            <line
              x1={leftPadding}
              y1={y}
              x2={svgWidth}
              y2={y}
              style={{ stroke: "var(--axis-border-default)" }}
              strokeWidth="1"
              strokeDasharray={i === 0 ? "none" : "4 4"}
            />
            <text
              x={leftPadding - 6}
              y={y + 4}
              textAnchor="end"
              style={{ fill: "var(--axis-text-tertiary)" }}
              fontSize="10"
            >
              {value}
            </text>
          </g>
        );
      })}

      {/* 바 + X축 라벨 */}
      {data.map((d, i) => {
        const barH = (d.count / maxCount) * chartHeight;
        const x = leftPadding + barGap + i * (barWidth + barGap);
        const y = topPadding + chartHeight - barH;
        return (
          <g key={d.date}>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={Math.max(barH, 2)}
              rx="3"
              style={{ fill: "var(--axis-chart-bar)" }}
            />
            {d.count > 0 && (
              <text
                x={x + barWidth / 2}
                y={y - 4}
                textAnchor="middle"
                style={{ fill: "var(--axis-text-secondary)" }}
                fontSize="10"
                fontWeight="600"
              >
                {d.count}
              </text>
            )}
            <text
              x={x + barWidth / 2}
              y={topPadding + chartHeight + 16}
              textAnchor="middle"
              style={{ fill: "var(--axis-text-tertiary)" }}
              fontSize="10"
            >
              {formatDate(d.date)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
