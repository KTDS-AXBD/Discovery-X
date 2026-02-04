/**
 * Funnel Chart 컴포넌트
 *
 * 신호 → 문제 → 기회 → 선별 목록 → 최종 선정 퍼널 시각화
 */

import type { VdFunnelData } from "../types";

interface FunnelChartProps {
  data: VdFunnelData;
  className?: string;
}

export function FunnelChart({ data, className = "" }: FunnelChartProps) {
  const maxValue = Math.max(data.signals, 1);

  const stages = [
    { key: "signals", label: "신호", value: data.signals },
    { key: "problems", label: "문제", value: data.problems },
    { key: "opportunities", label: "기회", value: data.opportunities },
    { key: "shortlist", label: "선별 목록", value: data.shortlist },
    { key: "final", label: "최종 선정", value: data.final },
  ];

  return (
    <div className={`flex items-end justify-between gap-4 ${className}`}>
      {stages.map((stage, index) => {
        const height = Math.max((stage.value / maxValue) * 120, 20);
        const conversionRate =
          index > 0 && stages[index - 1].value > 0
            ? ((stage.value / stages[index - 1].value) * 100).toFixed(0)
            : null;

        return (
          <div key={stage.key} className="flex flex-1 flex-col items-center">
            {/* 바 */}
            <div
              className="w-full rounded-t-md bg-[var(--axis-surface-brand)] transition-all"
              style={{ height: `${height}px` }}
            />
            {/* 라벨 */}
            <div className="mt-2 text-center">
              <div className="text-lg font-bold text-[var(--axis-text-primary)]">{stage.value}</div>
              <div className="text-xs text-[var(--axis-text-tertiary)]">{stage.label}</div>
              {conversionRate && (
                <div className="mt-1 text-xs text-[var(--axis-text-tertiary)]">
                  ({conversionRate}%)
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface FunnelCompactProps {
  data: VdFunnelData;
  className?: string;
}

export function FunnelCompact({ data, className = "" }: FunnelCompactProps) {
  return (
    <div className={`flex items-center gap-2 text-sm ${className}`}>
      <FunnelStage label="S" value={data.signals} />
      <FunnelArrow />
      <FunnelStage label="P" value={data.problems} />
      <FunnelArrow />
      <FunnelStage label="O" value={data.opportunities} />
      <FunnelArrow />
      <FunnelStage label="SL" value={data.shortlist} highlight />
      <FunnelArrow />
      <FunnelStage label="F" value={data.final} highlight />
    </div>
  );
}

function FunnelStage({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-1 rounded-full px-2 py-0.5 ${
        highlight
          ? "bg-[var(--axis-surface-brand)] text-[var(--axis-text-on-brand)]"
          : "bg-[var(--axis-surface-secondary)] text-[var(--axis-text-secondary)]"
      }`}
    >
      <span className="text-xs opacity-70">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function FunnelArrow() {
  return <span className="text-[var(--axis-text-tertiary)]">→</span>;
}
