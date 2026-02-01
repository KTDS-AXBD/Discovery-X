import { useState } from "react";

interface StatusDonutProps {
  inbox: number;
  open: number;
  next: number;
  notNow: number;
  deadEnd: number;
}

const SEGMENTS = [
  { key: "inbox", label: "Inbox", color: "var(--axis-chart-inbox)" },
  { key: "open", label: "진행 중", color: "var(--axis-chart-open)" },
  { key: "next", label: "전진", color: "var(--axis-chart-next)" },
  { key: "notNow", label: "보류", color: "var(--axis-chart-not-now)" },
  { key: "deadEnd", label: "중단", color: "var(--axis-chart-dead-end)" },
] as const;

export function StatusDonut({ inbox, open, next, notNow, deadEnd }: StatusDonutProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const values: Record<string, number> = { inbox, open, next, notNow, deadEnd };
  const total = inbox + open + next + notNow + deadEnd;

  if (total === 0) {
    return (
      <div className="flex flex-col items-center">
        <svg viewBox="0 0 120 120" width="200" height="200">
          <circle
            cx="60"
            cy="60"
            r="50"
            fill="none"
            style={{ stroke: "var(--axis-chart-empty)" }}
            strokeWidth="20"
          />
          <text x="60" y="64" textAnchor="middle" className="text-sm" style={{ fill: "var(--axis-text-tertiary)" }} fontSize="14">
            0건
          </text>
        </svg>
        <p className="mt-2 text-sm text-[var(--axis-text-tertiary)]">데이터 없음</p>
      </div>
    );
  }

  const circumference = 2 * Math.PI * 50;

  // Precompute segment offsets
  const segmentData = SEGMENTS.reduce<{ key: string; label: string; color: string; dash: number; offset: number; value: number }[]>(
    (acc, seg) => {
      const value = values[seg.key];
      if (value === 0) return acc;
      const dash = (value / total) * circumference;
      const prevOffset = acc.length > 0 ? acc[acc.length - 1].offset + acc[acc.length - 1].dash : 0;
      acc.push({ key: seg.key, label: seg.label, color: seg.color, dash, offset: prevOffset, value });
      return acc;
    },
    []
  );

  const hoveredSeg = hovered ? segmentData.find((s) => s.key === hovered) : null;

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 120 120" width="200" height="200">
        {segmentData.map((seg) => (
          <circle
            key={seg.key}
            cx="60"
            cy="60"
            r="50"
            fill="none"
            style={{
              stroke: seg.color,
              strokeWidth: hovered === seg.key ? 24 : 20,
              transition: "stroke-width 0.2s ease-out",
              cursor: "pointer",
            }}
            strokeDasharray={`${seg.dash} ${circumference - seg.dash}`}
            strokeDashoffset={-seg.offset}
            transform="rotate(-90 60 60)"
            onMouseEnter={() => setHovered(seg.key)}
            onMouseLeave={() => setHovered(null)}
          />
        ))}
        <text x="60" y="58" textAnchor="middle" style={{ fill: "var(--axis-text-primary)" }} fontSize={hoveredSeg ? "16" : "18"} fontWeight="bold">
          {hoveredSeg ? hoveredSeg.value : total}
        </text>
        <text x="60" y="72" textAnchor="middle" style={{ fill: "var(--axis-text-tertiary)" }} fontSize="11">
          {hoveredSeg ? hoveredSeg.label : "전체"}
        </text>
      </svg>
      {/* Legend */}
      <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-1">
        {SEGMENTS.map((seg) => {
          const value = values[seg.key];
          if (value === 0) return null;
          return (
            <div
              key={seg.key}
              className="flex items-center gap-1 text-xs text-[var(--axis-text-tertiary)]"
              style={{ opacity: hovered && hovered !== seg.key ? 0.4 : 1, transition: "opacity 0.2s" }}
              onMouseEnter={() => setHovered(seg.key)}
              onMouseLeave={() => setHovered(null)}
            >
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ backgroundColor: seg.color }}
              />
              {seg.label}: {value}
            </div>
          );
        })}
      </div>
    </div>
  );
}
