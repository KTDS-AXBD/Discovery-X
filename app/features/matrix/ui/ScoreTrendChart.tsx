import type { ScoreTrendEntry } from "~/features/matrix/types";

interface ScoreTrendChartProps {
  trend: ScoreTrendEntry[];
  height?: number;
}

// ─── SVG 라인 차트 (외부 라이브러리 없음) ───
export function ScoreTrendChart({ trend, height = 120 }: ScoreTrendChartProps) {
  if (trend.length < 2) {
    return (
      <div
        className="flex items-center justify-center rounded border border-dashed border-line-subtle text-[10px] text-fg-tertiary font-mono-dx"
        style={{ height }}
      >
        추세 데이터 부족 (최소 2개 기간 필요)
      </div>
    );
  }

  const padding = { top: 10, right: 10, bottom: 24, left: 30 };
  const width = 300;
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const minY = 0;
  const maxY = 5;

  function scaleX(i: number): number {
    return padding.left + (i / (trend.length - 1)) * chartW;
  }

  function scaleY(v: number): number {
    return padding.top + chartH - ((v - minY) / (maxY - minY)) * chartH;
  }

  function toPath(data: number[]): string {
    return data
      .map((v, i) => `${i === 0 ? "M" : "L"} ${scaleX(i).toFixed(1)} ${scaleY(v).toFixed(1)}`)
      .join(" ");
  }

  const compositeData = trend.map((t) => t.compositeScore);
  const clevelData = trend.map((t) => t.clevelScore);
  const execData = trend.map((t) => t.executionScore);

  // Y축 눈금
  const yTicks = [1, 2, 3, 4, 5];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full font-mono-dx"
      style={{ maxHeight: height }}
    >
      {/* 그리드 */}
      {yTicks.map((y) => (
        <g key={y}>
          <line
            x1={padding.left}
            y1={scaleY(y)}
            x2={width - padding.right}
            y2={scaleY(y)}
            stroke="var(--dx-border-subtle,#334155)"
            strokeWidth={0.5}
            strokeDasharray="2,2"
          />
          <text
            x={padding.left - 4}
            y={scaleY(y) + 3}
            textAnchor="end"
            fontSize={8}
            fill="var(--axis-text-tertiary,#64748b)"
          >
            {y}
          </text>
        </g>
      ))}

      {/* C-Level (보조) */}
      <path
        d={toPath(clevelData)}
        fill="none"
        stroke="var(--dx-score-medium)"
        strokeWidth={1}
        strokeDasharray="3,2"
        opacity={0.5}
      />

      {/* Execution (보조) */}
      <path
        d={toPath(execData)}
        fill="none"
        stroke="var(--dx-score-high)"
        strokeWidth={1}
        strokeDasharray="3,2"
        opacity={0.5}
      />

      {/* Composite (주) */}
      <path
        d={toPath(compositeData)}
        fill="none"
        stroke="var(--dx-lab-accent,#6366f1)"
        strokeWidth={2}
      />

      {/* 데이터 포인트 */}
      {compositeData.map((v, i) => (
        <circle
          key={`c-${trend[i].period}`}
          cx={scaleX(i)}
          cy={scaleY(v)}
          r={3}
          fill="var(--dx-lab-accent,#6366f1)"
        />
      ))}

      {/* X축 레이블 */}
      {trend.map((t, i) => (
        <text
          key={t.period}
          x={scaleX(i)}
          y={height - 4}
          textAnchor="middle"
          fontSize={7}
          fill="var(--axis-text-tertiary,#64748b)"
        >
          {t.period.slice(5)} {/* MM만 표시 */}
        </text>
      ))}

      {/* 범례 */}
      <g transform={`translate(${padding.left}, ${height - 14})`}>
        <line x1={0} y1={0} x2={10} y2={0} stroke="var(--dx-lab-accent,#6366f1)" strokeWidth={2} />
        <text x={13} y={3} fontSize={7} fill="var(--axis-text-tertiary,#64748b)">종합</text>
        <line x1={40} y1={0} x2={50} y2={0} stroke="var(--dx-score-medium)" strokeWidth={1} strokeDasharray="3,2" />
        <text x={53} y={3} fontSize={7} fill="var(--axis-text-tertiary,#64748b)">C-Level</text>
        <line x1={85} y1={0} x2={95} y2={0} stroke="var(--dx-score-high)" strokeWidth={1} strokeDasharray="3,2" />
        <text x={98} y={3} fontSize={7} fill="var(--axis-text-tertiary,#64748b)">Exec</text>
      </g>
    </svg>
  );
}
