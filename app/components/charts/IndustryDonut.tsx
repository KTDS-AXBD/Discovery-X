import { useState } from "react";

interface IndustryDonutProps {
  data: { name: string; count: number; color: string }[];
}

export function IndustryDonut({ data }: IndustryDonutProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const total = data.reduce((sum, d) => sum + d.count, 0);

  if (total === 0) {
    return (
      <div className="flex flex-col items-center">
        <svg viewBox="0 0 120 120" width="200" height="200">
          <circle
            cx="60"
            cy="60"
            r="50"
            fill="none"
            style={{ stroke: "var(--axis-chart-empty, var(--axis-border-default))" }}
            strokeWidth="20"
          />
          <text
            x="60"
            y="64"
            textAnchor="middle"
            style={{ fill: "var(--axis-text-tertiary)" }}
            fontSize="14"
          >
            0건
          </text>
        </svg>
        <p className="mt-2 text-sm text-[var(--axis-text-tertiary)]">데이터 없음</p>
      </div>
    );
  }

  const circumference = 2 * Math.PI * 50;

  const segments = data.reduce<
    { name: string; color: string; dash: number; offset: number; count: number }[]
  >((acc, item) => {
    if (item.count === 0) return acc;
    const dash = (item.count / total) * circumference;
    const prevOffset =
      acc.length > 0 ? acc[acc.length - 1].offset + acc[acc.length - 1].dash : 0;
    acc.push({ name: item.name, color: item.color, dash, offset: prevOffset, count: item.count });
    return acc;
  }, []);

  const hoveredSeg = hovered ? segments.find((s) => s.name === hovered) : null;

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 120 120" width="200" height="200">
        {segments.map((seg) => (
          <circle
            key={seg.name}
            cx="60"
            cy="60"
            r="50"
            fill="none"
            style={{
              stroke: seg.color,
              strokeWidth: hovered === seg.name ? 24 : 20,
              transition: "stroke-width 0.2s ease-out",
              cursor: "pointer",
            }}
            strokeDasharray={`${seg.dash} ${circumference - seg.dash}`}
            strokeDashoffset={-seg.offset}
            transform="rotate(-90 60 60)"
            onMouseEnter={() => setHovered(seg.name)}
            onMouseLeave={() => setHovered(null)}
          />
        ))}
        <text
          x="60"
          y="58"
          textAnchor="middle"
          style={{ fill: "var(--axis-text-primary)" }}
          fontSize={hoveredSeg ? "16" : "18"}
          fontWeight="bold"
        >
          {hoveredSeg ? hoveredSeg.count : total}
        </text>
        <text
          x="60"
          y="72"
          textAnchor="middle"
          style={{ fill: "var(--axis-text-tertiary)" }}
          fontSize="11"
        >
          {hoveredSeg ? hoveredSeg.name : "전체"}
        </text>
      </svg>

      <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-1">
        {data.map((item) => {
          if (item.count === 0) return null;
          return (
            <div
              key={item.name}
              className="flex items-center gap-1 text-xs text-[var(--axis-text-tertiary)]"
              style={{
                opacity: hovered && hovered !== item.name ? 0.4 : 1,
                transition: "opacity 0.2s",
              }}
              onMouseEnter={() => setHovered(item.name)}
              onMouseLeave={() => setHovered(null)}
            >
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              {item.name}: {item.count}
            </div>
          );
        })}
      </div>
    </div>
  );
}
