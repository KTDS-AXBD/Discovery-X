import { useState } from "react";

// ============================================================================
// TYPES
// ============================================================================

export interface TierDistribution {
  frugal: number;
  standard: number;
  frontier: number;
}

export interface PalSavingsWidgetProps {
  distribution: TierDistribution;
  /** 예상 절감 금액 (USD) */
  estimatedSavingsUsd: number;
  /** 비교 기준: PAL 미사용 시 예상 비용 (USD) */
  baselineCostUsd: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const TIER_SEGMENTS = [
  { key: "frugal" as const, label: "Frugal", color: "#22c55e" },
  { key: "standard" as const, label: "Standard", color: "#3b82f6" },
  { key: "frontier" as const, label: "Frontier", color: "#f59e0b" },
] as const;

// ============================================================================
// COMPONENT
// ============================================================================

export function PalSavingsWidget({
  distribution,
  estimatedSavingsUsd,
  baselineCostUsd,
}: PalSavingsWidgetProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const total = distribution.frugal + distribution.standard + distribution.frontier;

  if (total === 0) {
    return (
      <div className="rounded-lg border border-bd-secondary bg-bg-secondary p-4">
        <h3 className="mb-3 text-sm font-medium text-fg-secondary">
          PAL 티어 분포
        </h3>
        <p className="text-sm text-fg-tertiary">데이터 없음</p>
      </div>
    );
  }

  const savingsPct =
    baselineCostUsd > 0
      ? Math.round((estimatedSavingsUsd / baselineCostUsd) * 100)
      : 0;

  // Donut chart 계산
  const circumference = 2 * Math.PI * 50;
  const segmentData = TIER_SEGMENTS.reduce<
    {
      key: string;
      label: string;
      color: string;
      dash: number;
      offset: number;
      value: number;
      pct: number;
    }[]
  >((acc, seg) => {
    const value = distribution[seg.key];
    if (value === 0) return acc;
    const pct = Math.round((value / total) * 100);
    const dash = (value / total) * circumference;
    const prevOffset =
      acc.length > 0 ? acc[acc.length - 1].offset + acc[acc.length - 1].dash : 0;
    acc.push({ key: seg.key, label: seg.label, color: seg.color, dash, offset: prevOffset, value, pct });
    return acc;
  }, []);

  const hoveredSeg = hovered
    ? segmentData.find((s) => s.key === hovered)
    : null;

  return (
    <div className="rounded-lg border border-bd-secondary bg-bg-secondary p-4">
      <h3 className="mb-3 text-sm font-medium text-fg-secondary">
        PAL 티어 분포
      </h3>

      <div className="flex items-center gap-6">
        {/* Donut Chart */}
        <svg viewBox="0 0 120 120" width="120" height="120" className="shrink-0">
          {segmentData.map((seg) => (
            <circle
              key={seg.key}
              cx="60"
              cy="60"
              r="50"
              fill="none"
              stroke={seg.color}
              strokeWidth={hovered === seg.key ? 22 : 18}
              strokeDasharray={`${seg.dash} ${circumference - seg.dash}`}
              strokeDashoffset={-seg.offset}
              transform="rotate(-90 60 60)"
              style={{ transition: "stroke-width 0.2s ease-out", cursor: "pointer" }}
              onMouseEnter={() => setHovered(seg.key)}
              onMouseLeave={() => setHovered(null)}
            />
          ))}
          <text
            x="60"
            y="58"
            textAnchor="middle"
            className="text-fg-primary"
            fill="currentColor"
            fontSize={hoveredSeg ? "14" : "16"}
            fontWeight="bold"
          >
            {hoveredSeg ? `${hoveredSeg.pct}%` : total}
          </text>
          <text
            x="60"
            y="72"
            textAnchor="middle"
            className="text-fg-tertiary"
            fill="currentColor"
            fontSize="10"
          >
            {hoveredSeg ? hoveredSeg.label : "요청"}
          </text>
        </svg>

        {/* Stats */}
        <div className="flex flex-col gap-2">
          {/* Legend */}
          {TIER_SEGMENTS.map((seg) => {
            const value = distribution[seg.key];
            if (value === 0) return null;
            const pct = Math.round((value / total) * 100);
            return (
              <div
                key={seg.key}
                className="flex items-center gap-2 text-xs"
                style={{
                  opacity: hovered && hovered !== seg.key ? 0.4 : 1,
                  transition: "opacity 0.2s",
                }}
                onMouseEnter={() => setHovered(seg.key)}
                onMouseLeave={() => setHovered(null)}
              >
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: seg.color }}
                />
                <span className="text-fg-secondary">{seg.label}</span>
                <span className="text-fg-tertiary">
                  {value}건 ({pct}%)
                </span>
              </div>
            );
          })}

          {/* Savings */}
          <div className="mt-1 border-t border-bd-secondary pt-2">
            <div className="text-xs text-fg-tertiary">예상 절감</div>
            <div className="flex items-baseline gap-1">
              <span className="text-base font-bold text-green-500">
                ${estimatedSavingsUsd.toFixed(2)}
              </span>
              {savingsPct > 0 && (
                <span className="text-xs text-green-400">
                  (-{savingsPct}%)
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
